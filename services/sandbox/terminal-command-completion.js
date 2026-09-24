const META_PREFIX = "\u001dGITSTACK_META:";
const META_SUFFIX = "\u001e";

function retainedPrefixLength(value) {
  const max = Math.min(value.length, META_PREFIX.length - 1);
  for (let size = max; size > 0; size -= 1) {
    if (META_PREFIX.startsWith(value.slice(-size))) return size;
  }
  return 0;
}

export function parseTerminalCommandCompletion(carry = "", chunk = "") {
  let data = String(carry || "") + String(chunk || "");
  let output = "";
  const events = [];

  while (data) {
    const start = data.indexOf(META_PREFIX);
    if (start < 0) {
      const keep = retainedPrefixLength(data);
      output += keep ? data.slice(0, -keep) : data;
      data = keep ? data.slice(-keep) : "";
      break;
    }

    output += data.slice(0, start);
    const end = data.indexOf(META_SUFFIX, start + META_PREFIX.length);
    if (end < 0) {
      data = data.slice(start);
      break;
    }

    const payload = data.slice(start + META_PREFIX.length, end);
    const separator = payload.indexOf("|");
    if (separator >= 0) {
      const exitCode = Number(payload.slice(0, separator));
      const cwd = payload.slice(separator + 1);
      if (Number.isInteger(exitCode) && cwd.startsWith("/")) {
        events.push({ exitCode, cwd });
      }
    }
    data = data.slice(end + META_SUFFIX.length);
  }

  return { output, carry: data, events };
}

export function missionPromptCommandEnv() {
  return `PROMPT_COMMAND=printf '\\035GITSTACK_META:%s|%s\\036' "$?" "$PWD"`;
}


export function classifyTerminalCompletionEvent({ initialPromptSeen = false, hasPendingCommand = false } = {}) {
  if (!initialPromptSeen) return "startup";
  if (hasPendingCommand) return "command";
  return "idle";
}
