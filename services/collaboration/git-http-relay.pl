# Git's Debian sandbox already includes Perl and these core modules.
# Listen only inside this sandbox; carry bytes over Docker exec, not a bridge.
use strict;
use warnings;
use IO::Socket::INET;
use IO::Select;
use JSON::PP qw(encode_json decode_json);
use MIME::Base64 qw(encode_base64 decode_base64);
use Fcntl qw(F_GETFL F_SETFL O_NONBLOCK);
use Errno qw(EAGAIN EWOULDBLOCK EINTR);

$| = 1;
$SIG{PIPE} = 'IGNORE';
binmode STDIN;
binmode STDOUT;
my $listener = IO::Socket::INET->new(
    LocalAddr => '127.0.0.1', LocalPort => 0, Listen => 8,
    Proto => 'tcp', ReuseAddr => 1
) or die "Unable to open the collaboration Git listener.\n";
my $readers = IO::Select->new(\*STDIN, $listener);
my $writers = IO::Select->new();
my (%clients, %by_fd);
my $sequence = 0;
my $input = '';

sub send_frame { print encode_json($_[0]), "\n" or exit 0; }
sub close_client {
    my ($id) = @_;
    my $client = delete $clients{$id} or return;
    my $socket = $client->{socket};
    delete $by_fd{fileno($socket)};
    $readers->remove($socket);
    $writers->remove($socket);
    close $socket;
    send_frame({ type => 'close', id => $id });
}
send_frame({ type => 'ready', port => $listener->sockport });

while (1) {
    my ($readable, $writable) = IO::Select->select($readers, $writers, undef, 1);
    for my $handle (@{$readable || []}) {
        if (fileno($handle) == fileno($listener)) {
            my $socket = $listener->accept() or next;
            if (scalar(keys %clients) >= 8) { close $socket; next; }
            binmode $socket;
            fcntl($socket, F_SETFL, fcntl($socket, F_GETFL, 0) | O_NONBLOCK);
            my $id = ++$sequence;
            $clients{$id} = { socket => $socket, queue => [], ended => 0, finish => 0 };
            $by_fd{fileno($socket)} = $id;
            $readers->add($socket);
            send_frame({ type => 'open', id => $id });
        } elsif (fileno($handle) == fileno(STDIN)) {
            my $count = sysread(STDIN, my $bytes, 65536);
            exit 0 unless defined($count) && $count > 0;
            $input .= $bytes;
            die "Invalid collaboration relay frame.\n" if length($input) > 262144;
            while ($input =~ s/^([^\n]*)\n//) {
                my $frame = eval { decode_json($1) };
                next unless ref($frame) eq 'HASH';
                my $id = $frame->{id};
                my $client = $clients{$id} or next;
                if ($frame->{type} eq 'data') {
                    if (length($frame->{data} || '') > 65536) { close_client($id); next; }
                    push @{$client->{queue}}, { bytes => decode_base64($frame->{data}), seq => $frame->{seq} };
                    $writers->add($client->{socket});
                } elsif ($frame->{type} eq 'end') {
                    $client->{finish} = 1;
                    if (!@{$client->{queue}}) { shutdown($client->{socket}, 1); }
                } elsif ($frame->{type} eq 'close') {
                    close_client($id);
                } elsif ($frame->{type} eq 'pause') {
                    $readers->remove($client->{socket});
                } elsif ($frame->{type} eq 'resume' && !$client->{ended}) {
                    $readers->add($client->{socket});
                }
            }
        } else {
            my $id = $by_fd{fileno($handle)};
            my $client = $clients{$id} or next;
            my $count = sysread($handle, my $bytes, 32768);
            if (!defined($count)) {
                next if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR;
                close_client($id);
            } elsif ($count == 0) {
                $client->{ended} = 1;
                $readers->remove($handle);
                send_frame({ type => 'end', id => $id });
            } else {
                send_frame({ type => 'data', id => $id, data => encode_base64($bytes, '') });
            }
        }
    }
    for my $handle (@{$writable || []}) {
        my $id = $by_fd{fileno($handle)};
        my $client = $clients{$id} or next;
        my $item = $client->{queue}[0];
        unless ($item) { $writers->remove($handle); next; }
        my $count = syswrite($handle, $item->{bytes});
        if (!defined($count)) {
            next if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR;
            close_client($id);
            next;
        }
        substr($item->{bytes}, 0, $count, '');
        if (!length($item->{bytes})) {
            shift @{$client->{queue}};
            send_frame({ type => 'ack', id => $id, seq => $item->{seq} });
        }
        if (!@{$client->{queue}}) {
            $writers->remove($handle);
            shutdown($handle, 1) if $client->{finish};
        }
    }
}
