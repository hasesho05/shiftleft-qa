# Sample App Fixture — Task Board

A minimal task management application fixture used for skill-contract E2E testing.

## Purpose

Verify that the skill-first workflow contract is not broken when running the
full pipeline against a realistic but small application.

## User Story

As a project member, I want to manage tasks with status transitions and
assignee permissions so that the team can track work progress.

## Acceptance Criteria

- Tasks can be created with title, description, and assignee
- Status transitions follow: draft -> open -> in_progress -> done
- Only the assignee or an admin can move a task to in_progress
- Invalid transitions return a clear validation error
- The task list page renders correctly with status badges

## Non-Goals

- Real-time collaboration or WebSocket push
- File attachments or rich text editing
- Multi-tenant workspace isolation
