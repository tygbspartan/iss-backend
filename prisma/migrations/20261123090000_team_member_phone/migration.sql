-- Team members: a contact phone number (admin only, optional) replaces email.
ALTER TABLE "team_members" ADD COLUMN "phone" TEXT;
ALTER TABLE "team_members" DROP COLUMN "email";
