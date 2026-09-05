# V14 Integration Report

## Previous work preserved

- Public learning frontend
- Student/instructor authentication
- encrypted user profile storage
- PostgreSQL + Prisma
- Docker sandbox and WebSocket terminal
- Student Dashboard V1
- individual mission validator
- Bangla feedback
- XP/progress

## V14 additions

### Database
- `Team.createdById`
- `Assignment.studentId`
- Prisma relationships for team ownership and direct student assignments

### Backend
- `routes/instructor-routes.js`
- dashboard statistics
- student reports
- mission performance
- assignment CRUD/status lifecycle
- exact three-person team management
- assessment review
- analytics
- activity feed
- instructor profile/password management

### Frontend
Ten instructor pages with one responsive dashboard shell and shared role/auth handling.

### Student integration
Student dashboard/missions now display active instructor assignments. MissionRun links to a matching active individual Assignment when the student starts that mission.

## Gitea boundary

No fake PR/review implementation was added. The project plan says Gitea must provide repository hosting, Issues, Pull Requests, review/approval and merge features. V14 prepares teams and assignments for that integration while preserving honest UI messages that Gitea is the next phase.
