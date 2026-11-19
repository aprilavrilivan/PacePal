# PacePal Product Decision Log

These decisions convert the product brief into an implementation boundary. Changes should be recorded here so product scope does not drift silently.

## PD-001 — Web-first delivery

**Decision:** The initial product is a browser-based web application deployed from GitHub through a web hosting platform. Native desktop packaging is not part of the MVP.

**Reason:** Browser access minimizes adoption friction and supports rapid iteration. The pet will initially live inside the web interface.

## PD-002 — One active assignment acceptance scope

**Decision:** MVP acceptance focuses on one substantial active assignment per user. The architecture should not prevent multiple assignments later, but cross-assignment scheduling is excluded.

**Reason:** This matches the PRD's initial focus and keeps scheduling behavior testable.

## PD-003 — Final MVP includes minimal rescheduling, risk, and pet

**Decision:** Dynamic rescheduling, deadline-risk communication, and an in-app pet are required for the final MVP in their smallest functional forms.

**Reason:** They are present in the PRD's successful end-to-end scenario and distinguish PacePal from a generic task manager.

## PD-004 — LLM and scheduler are separate components

**Decision:** The LLM interprets natural language, asks clarifying questions, and proposes task structures. A deterministic engine owns scheduling, dependency enforcement, capacity checks, and deadline risk.

**Reason:** Calendar constraints must be reliable, reproducible, and independently testable.

## PD-005 — AI plans require approval

**Decision:** AI-generated subtasks and material schedule revisions remain proposals until the user approves or edits them.

**Reason:** PacePal is a collaborative planner, and the student retains control.

## PD-006 — Planning assistance, not academic generation

**Decision:** The MVP may interpret requirements, organize work, suggest approaches, and help unblock a task. Producing a complete academic submission is outside the product purpose.

**Reason:** The product supports student agency and academic integrity.

## PD-007 — Demo mode is a release requirement

**Decision:** A deterministic mock AI provider must allow the complete workflow to be tested without external model credentials.

**Reason:** Development, automated testing, review, and fallback behavior must not depend on a live paid service.

## PD-008 — In-app reminders only for MVP

**Decision:** MVP reminders appear inside PacePal. Browser push, email, SMS, and operating-system notifications are deferred.

**Reason:** In-app reminders prove the product interaction without introducing background permissions and delivery infrastructure.

## PD-009 — User-local time is authoritative

**Decision:** Deadlines, availability, recommendations, and schedule blocks are interpreted in the user's configured timezone and stored in an unambiguous format.

**Reason:** Scheduling behavior becomes unreliable if browser, server, and database time assumptions diverge.

## PD-010 — Minimal, function-first interface

**Decision:** PacePal uses a minimal visual system and concise interface copy. Screens use one page title without a routine explanatory subtitle, one dominant primary action, and only the information required to act or understand essential state. Decorative elements and repetitive helper text are excluded.

**Reason:** PacePal should reduce cognitive load for students who already feel overwhelmed. Visual noise, nested headings, excessive cards, and explanatory small print would work against that purpose.

**Boundary:** Necessary labels, validation, error recovery, accessibility text, recommendation reasons, and security or consent information remain required, but must be expressed directly and briefly.
