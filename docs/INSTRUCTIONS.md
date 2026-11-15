# Michael's Flowers — Mobile Delivery Confirmation Web Application

> **Prototype 3: Mobile Delivery Confirmation**
>
> This instruction file governs the mobile delivery confirmation prototype only. Build on the existing Michael's Flowers project without replacing or disrupting the TSP route optimization prototype.

---

## 1. Project Context

- This is a university capstone application for Michael's Flowers.
- The current development focus is the **Mobile Delivery Confirmation** prototype.
- The goal is to replace paper delivery confirmation sheets with a clear, mobile-friendly web application.
- Drivers use the application to review delivery information and submit proof of delivery.
- Employees use a centralized dashboard to find and review confirmation records.
- The existing project uses React, TypeScript, Vite, Cloudflare Workers, Cloudflare D1, Azure Maps, and OSRM.
- Follow the existing project structure, component patterns, API conventions, design system, and coding standards.
- Preserve the existing TSP route optimization application and all working functionality.
- The three prototypes may eventually be integrated:
  1. TSP-Based Route Optimization.
  2. Delivery Status Tracking.
  3. Mobile Delivery Confirmation.

### Important: No Login

- **Do not add a login page or a new login process for this prototype.**
- Do not add driver usernames, passwords, PINs, registration, sign-in, or account creation.
- Do not add a new authentication provider.
- Do not assume that a driver has been authenticated or that a submitted confirmation proves the identity of the person using the device.
- The absence of a login is a project requirement, not permission to expose sensitive delivery information publicly. Follow the security and deployment restrictions in this document.
- The ZIP project currently contains an authentication architecture for the route-optimization prototype. Do not remove, bypass, weaken, or rewrite that existing authentication. Keep this prototype's no-login requirement isolated and discuss any integration conflict before changing shared authentication or routing.

---

## 2. Inspect the Existing Project Before Development

The supplied route-optimization ZIP is the visual and technical reference. Inspect the current working copy before making changes; do not assume the ZIP and working branch are identical.

Relevant existing project patterns include:

- `frontend/src/components/` for reusable interface components.
- `frontend/src/pages/` for page-level components.
- `frontend/src/styles.css` for the shared visual system and responsive styling.
- `frontend/public/brand/` for the sponsor's original logo artwork.
- `shared/types.ts` and `shared/schemas.ts` for shared data types and validation.
- `worker/src/` for Cloudflare Worker API handling.
- `migrations/` and `docs/SCHEMA.md` for the D1 schema.
- `docs/ARCHITECTURE.md`, `docs/API.md`, and `docs/TESTING.md` for architecture, API, and testing conventions.

Before proposing implementation:

1. Inspect the current branch and working tree.
2. Inspect the relevant frontend pages, reusable components, styles, API handlers, shared types, database schema, and tests.
3. Identify which existing delivery/order fields can be reused.
4. Identify whether the existing project already stores product counts, delivery notes, recipient information, or delivery status.
5. Identify how the current app serves its logo and handles printing.
6. Explain any conflicts between the current authentication model and this prototype's no-login requirement.
7. Present a small, focused implementation plan and wait for explicit approval ("go").

Do not change files during this inspection phase.

---

## 3. Technology and Architecture

Use the existing architecture unless an approved technical decision requires otherwise.

| Technology | Purpose |
| --- | --- |
| React + TypeScript | Build the driver confirmation interface and employee confirmation dashboard. |
| Vite | Frontend development and production build, following the existing setup. |
| Cloudflare Workers | Backend API for validation, confirmation submission, and confirmation retrieval. |
| Cloudflare D1 | Store confirmation records and their relationship to existing delivery/order records. |
| Existing shared project code | Reuse established types, validation, API helpers, UI components, and formatting conventions. |

### Technology rules

- This is a **web application**, not a React Native application. Use the existing React + TypeScript frontend and make it work especially well on mobile screens.
- Continue using Cloudflare Workers and D1. Do not introduce MySQL, SQL Server Express, or a second database for the same records.
- Do not introduce a separate server stack.
- Do not add dependencies unless they are necessary, compatible with the project, and approved.
- Do not add paid storage, paid APIs, or services that can incur costs without asking first.
- Do not add GPS tracking, live location sharing, route optimization, or route assignment as part of this prototype.
- Do not change existing database schemas, API contracts, or environment configuration without approval.

---

## 4. Purpose

Create a polished, easy-to-use mobile delivery confirmation experience that allows a driver to submit delivery details electronically and allows employees to retrieve proof of delivery using the order ID.

The application should:

- Reduce reliance on paper delivery sheets.
- Make delivery information easy to read at a glance.
- Connect every confirmation to the correct order/ticket.
- Capture who received the delivery, the customer's signature, and any delivery exception.
- Record when the confirmation was submitted.
- Help employees identify missing, duplicate, incomplete, or failed submissions.
- Keep customer and delivery information protected.

---

## 5. Visual Design and Sponsor Branding

The interface should look like a natural extension of the existing Michael's Flowers route-optimization application. Do not create an unrelated generic dashboard design.

### Brand assets

- Use the sponsor's supplied Michael's Flowers logo.
- Prefer the exact logo assets already included in `frontend/public/brand/` when present in the working project.
- Preserve the logo's original proportions. Never stretch, redraw, recolor, crop, or replace it with typed text.
- Provide meaningful alternative text when the logo communicates the brand; use empty alternative text only when it is purely decorative beside an equivalent accessible brand name.
- Do not embed a second, low-quality copy of the logo when the existing brand assets can be reused.

### Existing brand palette

The supplied ZIP's stylesheet documents the logo colors. Match the existing design tokens rather than inventing a new palette.

| Use | Existing color |
| --- | --- |
| Main navy / headings | `#243772` |
| Primary purple | `#6e4a6a` |
| Logo petal purple | `#8d6388` |
| Lavender accents | `#bf94c5` |
| Soft lavender surface | `#f4eef6` |
| Warm page background | `#faf8f3` |
| White cards | `#ffffff` |
| Success | `#2f6b4f` |
| Error | `#b42318` |

Use the existing CSS variables and theme conventions where possible. Do not hardcode a competing color system throughout new components.

### Design direction

- Professional, polished, welcoming, and easy to understand.
- Use clean white cards over the existing warm page background.
- Use navy for headings and important information.
- Use purple for primary actions, active navigation, and selected states.
- Use lavender for subtle highlights and supporting sections.
- Use green only for successful or completed states.
- Use amber for warnings and delivery exceptions that need attention.
- Use red for failed submissions and serious errors.
- Use clear typography, consistent spacing, subtle borders, and restrained shadows.
- Avoid excessive gradients, oversized decoration, clutter, or tiny text.
- Keep important delivery details visually prominent.
- Maintain accessible color contrast and visible keyboard focus states.
- Use consistent styling with the existing application's cards, buttons, notices, form fields, and page headings.

---

## 6. Required Delivery Information Layout

The delivery card/detail view must display the fields in the exact order below. Do not rearrange the order or hide key fields behind unnecessary tabs or menus.

### Required display order

1. **#**
2. **Zone**
3. **Order ID**
   - Display the readable order ID.
   - Display a scannable barcode directly underneath the order ID.
   - The barcode must encode the same order ID shown in text.
   - Keep the human-readable order ID visible; never make the barcode the only way to identify an order.
4. **Deliver To**
   - Recipient/customer name, when available.
   - Delivery address.
   - Any relevant delivery notes.
   - **Delivery Exception** appears as a small subsection within the Deliver To section, directly below the address and delivery details. It should look visually secondary to the recipient and address information, not like a separate major section.
5. **Total Products**
   - Display the total number of products/items for the order.
   - Use the actual value from the existing order data. Do not invent a count or silently calculate it from unrelated fields.
6. **Delivery Instructions**
   - Show the relevant instructions clearly.
   - Include **Received By:** for the recipient's name.
   - Include **Customer Signature:** for the electronic signature capture and saved signature display.

### Example structure

```text
┌──────────────────────────────────────────────┐
│ # 1                              ZONE: A     │
│                                              │
│ ORDER ID                                     │
│ MF-10482                                     │
│ [            BARCODE             ]           │
│                                              │
│ DELIVER TO                                   │
│ Recipient Name                               │
│ Street Address                               │
│ City, State ZIP                              │
│                                              │
│   Delivery Exception                         │
│   ○ Delivered to recipient                   │
│   ○ Left at door                             │
│   ○ Left with front desk / reception         │
│   ○ Left with neighbor                       │
│   ○ Other (describe)                         │
│                                              │
│ TOTAL PRODUCTS                               │
│ 3                                            │
│                                              │
│ DELIVERY INSTRUCTIONS                        │
│ Existing delivery instructions...            │
│                                              │
│ RECEIVED BY                                  │
│ [Recipient name________________________]     │
│                                              │
│ CUSTOMER SIGNATURE                           │
│ [                                            │
│   Signature capture area                     │
│                                            ] │
│                                              │
│ [ Clear signature ]                          │
│                                              │
│ [ Submit delivery confirmation ]             │
└──────────────────────────────────────────────┘
```

This is a content-order reference, not a requirement to copy the rough box drawing. Produce a polished responsive design that follows the same information hierarchy.

### Field behavior

- `#` is the stop/sequence number when the confirmation is being used with an existing route. If no route sequence exists, display a neutral value such as an em dash; do not fabricate a sequence.
- `Zone` must use an existing zone value if one exists. If the current project does not store zones, do not invent zone assignments. Show an em dash or ask for an approved zone source.
- `Order ID` must use the existing order/ticket identifier.
- Generate the barcode from the exact order ID. Use a format supported by a suitable barcode library only if a dependency is approved; otherwise inspect existing project capabilities first.
- `Deliver To` must use the existing recipient and address data. Do not expose unrelated customer records.
- `Total Products` must come from a real order field or an explicitly approved calculation.
- Delivery instructions should be read-only reference information unless the sponsor explicitly approves editing them in this prototype.
- The signature must be captured in a usable touch-friendly area on phones and with a mouse or stylus on desktop.
- Provide a clear/reset signature action before submission.
- Do not treat a typed recipient name as a substitute for the customer's signature.

---

## 7. Delivery Exceptions

Delivery exceptions must appear as a **small subsection inside the Deliver To section**, directly below the recipient and address details. Keep it visually grouped with Deliver To rather than presenting it as a separate major section.

Provide clear, easy-to-select options. Suggested options:

- Delivered to recipient.
- Left at door.
- Left with front desk / reception.
- Left with neighbor.
- Other.

### Exception behavior

- Use the sponsor-approved list if one already exists. The suggested options above must be reviewed before being treated as final business rules.
- Require an additional explanation when **Other** is selected.
- Allow an optional short note for an exception when appropriate.
- Do not automatically mark every exception as a successful handoff without an explicitly defined business rule.
- Record the selected exception with the confirmation.
- Make the selected exception visible in the employee dashboard and printed confirmation, grouped under the Deliver To details.
- Use clear visual labels so an employee can distinguish a normal recipient handoff from a delivery left in another location.
- Do not add delivery status tracking beyond what is necessary to record the confirmation result.

---

## 8. Driver Confirmation Workflow

1. The driver opens the mobile-friendly web application. No login screen is shown.
2. The application displays only the delivery information made available to this no-login prototype.
3. The driver selects or opens the correct delivery.
4. The driver verifies the `#`, zone, order ID, barcode, recipient/address, and total products.
5. The driver reviews the delivery instructions.
6. The driver selects the appropriate delivery exception/outcome.
7. The driver enters the **Received By** name.
8. The recipient provides a signature in the **Customer Signature** area.
9. The driver may enter an additional note if the selected exception requires it.
10. The application validates the information before submission.
11. The backend records the confirmation timestamp and saves the confirmation against the correct order ID.
12. The application shows a clear success state only after the backend confirms that the record was saved.
13. If the submission fails, the application explains the problem and provides a safe retry option.

### Submission requirements

- Do not mark a delivery as confirmed before the backend successfully saves the record.
- Prevent accidental double-clicks from creating multiple records.
- Make retry behavior safe if the network fails or the response is lost after a successful save.
- Preserve the driver's entered information after a recoverable submission failure.
- Show a clear confirmation summary after a successful submission.
- Do not silently discard a signature or exception note.

---

## 9. Employee Confirmation Dashboard

Provide a centralized dashboard for employees to review submitted confirmations.

### Dashboard capabilities

- Show a useful list of confirmation records.
- Search by the exact order/ticket ID.
- Display the order ID, confirmation time, recipient name, delivery exception, and submission result.
- Open a detail view containing the saved signature, instructions, and optional photo if photo support is approved.
- Clearly distinguish successful submissions from incomplete, failed, or flagged records.
- Identify missing confirmations when the system has a reliable source of expected deliveries.
- Flag duplicate attempts or conflicting records for review.
- Make it easy to retrieve a confirmation without searching through paper sheets.

### Dashboard boundaries

- Do not add unrelated route editing, inventory management, customer management, payments, or ordering features.
- Do not claim that a record is missing unless the system can compare it against a reliable list of expected deliveries.
- Do not expose the dashboard or customer proof-of-delivery information publicly. The no-login requirement creates an access-control limitation; see Section 11 before enabling real customer data or public deployment.

---

## 10. Data Requirements

Each saved confirmation should be linked to the existing delivery/order record.

Store only information that is needed and approved:

- Unique confirmation record ID.
- Existing order/ticket ID.
- Route stop number (`#`), if available.
- Zone, if available.
- Recipient name / **Received By**.
- Delivery exception/outcome.
- Exception explanation, when required.
- Customer signature data or a protected reference to the signature file.
- Confirmation timestamp generated by the server.
- Optional note.
- Optional photo reference, only if approved and supported.
- Submission result or review flag, if needed.

### Data integrity

- Reuse the existing order/ticket ID. Do not create a duplicate order record.
- Enforce the relationship between a confirmation and its existing order in the backend.
- Use database constraints and transactions where appropriate.
- Do not trust an order ID or other value merely because it came from the browser.
- Define how the application behaves when an order ID does not exist, has already been confirmed, or has been cancelled.
- Do not overwrite an existing signature or confirmation silently.
- Keep a reliable server-generated timestamp in UTC and format it for display in the user's locale.
- Do not invent missing order details, product totals, zones, addresses, or route sequence numbers.

---

## 11. Security, Privacy, and No-Login Limitations

Security is a major requirement. Apply the existing project's secure coding conventions wherever applicable.

### Important security limitation

A system with no login cannot reliably prove who is using the application. It also cannot provide true employee-only access to a dashboard simply by hiding a page or button in the frontend.

Therefore:

- Do not claim that a submitted signature authenticates the driver.
- Do not claim that a browser session identifies a particular employee or driver.
- Do not treat a client-provided driver name, order ID, zone, or role as proof of authorization.
- Do not expose all customer deliveries, signatures, addresses, or dashboard records through a public API.
- Do not deploy a publicly accessible employee dashboard containing real customer information without an approved access-control decision.
- Before production use, explain this limitation and ask the sponsor/user to approve an access model. Do not silently add a login system, Cloudflare Access requirement, or other authentication mechanism because the current requirement says no login.
- If no approved access model exists, limit the prototype to synthetic/demo data or a controlled local demonstration. Do not pretend that this is equivalent to production security.

### API and backend security

- Perform all meaningful validation on the Cloudflare Worker. Frontend validation is for usability, not security.
- Validate request method, content type, body size, field lengths, allowed values, and data types.
- Reject unexpected fields where the existing schema conventions support strict validation.
- Use parameterized SQL statements for every D1 query.
- Never build SQL by concatenating user-provided values.
- Use database constraints and transactions to protect record relationships and prevent inconsistent writes.
- Validate that the order exists and is eligible for confirmation before saving.
- Do not trust a client-provided timestamp. Generate the authoritative confirmation timestamp on the server.
- Do not trust a client-provided status. The backend determines the saved result.
- Protect state-changing requests against cross-site request forgery. Reuse the project's existing origin checks and CSRF protections where applicable; do not weaken them to make a no-login flow work.
- Apply sensible request size limits and rate limits to reduce automated abuse.
- Use generic error messages for unexpected server failures. Do not return stack traces, SQL details, environment variables, or internal implementation information.
- Use request IDs for troubleshooting without including customer information in those IDs or logs.
- Ensure CORS is restrictive and consistent with the existing same-origin application architecture.

### No-login access and record exposure

- Design the no-login driver experience around the minimum information needed to complete the intended delivery.
- Do not provide an unrestricted endpoint that lists every order or retrieves arbitrary confirmations by guessing order IDs.
- Do not rely on an unguessable URL alone as the only security measure for sensitive records.
- If the existing project has a safe, sponsor-approved way to provide a limited delivery-specific link or handoff, inspect it and propose its use before implementation. Do not invent or implement a token scheme without approval.
- Do not put customer names, addresses, signatures, or secrets into URL query strings.
- Do not cache sensitive confirmation responses in shared/public caches.
- Use `Cache-Control: no-store` for sensitive confirmation and signature responses where appropriate.
- Do not store sensitive delivery data in browser local storage, session storage, analytics, or third-party tracking tools.
- Do not include customer details in client-side error reporting or telemetry.
- Do not make employee dashboard data available to the no-login driver interface.

### Signature and photo protection

- Treat customer signatures and delivery photos as sensitive proof-of-delivery information.
- Do not make signature or photo files publicly readable through predictable or guessable URLs.
- Validate upload size, file type, and file content on the backend. Do not trust the filename or browser-provided MIME type.
- Allow only approved image formats if photo support is implemented.
- Reject oversized, malformed, or unsupported files.
- Use randomized storage object names; do not use customer names or order IDs as public filenames.
- Do not accept executable files or arbitrary document uploads.
- Do not add photo storage until the existing storage options, access controls, retention needs, and costs have been reviewed and approved.
- Avoid retaining temporary signature or photo data longer than necessary.
- Do not log signature contents, photo contents, or file URLs containing access tokens.

### Browser and application security

- Use HTTPS in any shared or deployed environment.
- Follow the existing project's security-header conventions.
- Preserve or strengthen Content Security Policy (CSP), `X-Content-Type-Options`, `Referrer-Policy`, and frame-embedding protections where appropriate.
- Avoid unsafe HTML injection. Render customer-entered text as text, not executable markup.
- Avoid `dangerouslySetInnerHTML` unless there is a reviewed and approved reason.
- Keep dependencies minimal and review new packages for maintenance and security concerns.
- Do not expose Cloudflare bindings, secrets, or server-only environment values to Vite client code.
- Keep secrets in ignored local environment files or secure Cloudflare settings.
- Never hardcode or commit passwords, API keys, tokens, or credentials.
- Never print actual secret values in responses, screenshots, test output, or logs.

### Privacy and testing

- Use synthetic/fake orders, addresses, recipient names, signatures, and photos during development.
- Never use real customer information for testing without explicit authorization.
- Collect only the information needed for delivery confirmation.
- Do not add analytics or third-party tracking without approval.
- Ask the sponsor to define signature/photo retention and deletion expectations before production use.
- Ask before deployment, paid API use, paid storage, or any action that could incur costs.

---

## 12. Accessibility and Mobile Usability

- Design mobile-first. The driver must be able to complete the form comfortably on a phone.
- Make tap targets large enough for touch interaction.
- Keep the barcode readable and scannable at common phone screen sizes and on printed pages.
- Keep the order ID readable even if barcode scanning is unavailable.
- Make the signature area large enough for a finger, stylus, or mouse.
- Provide a clear action to erase and recapture the signature.
- Do not rely on color alone to communicate delivery exceptions or submission states.
- Associate form labels with their controls.
- Support keyboard navigation and visible focus indicators.
- Provide accessible error messages and identify which fields need attention.
- Respect browser zoom and text scaling.
- Avoid horizontal scrolling at common mobile widths.
- Test portrait mobile layouts and desktop layouts.
- Make the primary submit action easy to find without obscuring important delivery information.

---

## 13. Printing and Confirmation Record Presentation

- Provide a clean print layout for an individual confirmation when useful to the employee.
- Use the same required field order as Section 6.
- Include the Michael's Flowers logo with its original proportions.
- Print the readable order ID and barcode together.
- Ensure the barcode has sufficient contrast, quiet space, and print resolution.
- Include the delivery exception, **Received By**, customer signature, and server-generated confirmation time.
- Do not print navigation, buttons, form controls, or unrelated dashboard elements.
- Do not claim a printout is proof of a successful database save unless the saved record was retrieved or confirmed by the backend.
- Follow the existing project's print styling conventions where possible.

---

## 14. Development and Change Management

- Work within the existing project structure.
- Inspect existing implementations before adding components, database tables, API endpoints, or dependencies.
- Reuse existing delivery records, ticket identifiers, types, validation helpers, API clients, UI components, and styles.
- Keep frontend and backend changes minimal and consistent with existing patterns.
- Preserve route generation, optimization, mapping, route printing, and existing authentication functionality.
- Do not modify authentication, database schemas, API contracts, or configuration without explicit approval.
- Do not delete files or overwrite substantial existing work without approval.
- Do not commit, push, merge, or deploy without explicit approval.
- Use a separate feature branch for this prototype.
- Review all changed files before proposing a commit.
- Explain technical concepts and proposed changes in plain English.
- Ask clarifying questions when requirements are unclear.
- Before changing code, inspect the relevant files, explain the plan, and wait for explicit approval ("go").

---

## 15. Test-Driven Development (TDD)

Follow the Red-Green-Refactor cycle for new features, bug fixes, and behavior changes.

### RED — Write Failing Tests

Identify expected behavior and write automated tests before changing production code.

Include tests for:

- The required delivery information appears in the correct order.
- `#`, zone, order ID, barcode, Deliver To, Total Products, and Delivery Instructions render correctly.
- The barcode encodes the exact visible order ID.
- Delivery exceptions appear directly underneath Deliver To.
- Selecting **Other** requires an explanation.
- **Received By** and **Customer Signature** are captured and validated.
- A valid confirmation is linked to the correct existing order.
- An invalid or unknown order ID is rejected.
- Missing required fields are rejected by the backend.
- The server, not the browser, supplies the authoritative timestamp.
- Duplicate submissions do not create duplicate confirmations.
- Retrying after a network error does not create a second confirmation.
- The delivery status is not updated unless the confirmation is successfully saved.
- Sensitive signature and confirmation responses are not publicly cached.
- Customer details and signature contents do not appear in logs.
- The driver-facing no-login flow does not expose an unrestricted list of all customer orders.
- Existing route-optimization tests and behavior remain unaffected.

Run the tests and confirm they fail for the intended reason. Do not modify production code during this phase.

### GREEN — Implement Minimum Changes

- Make only the changes needed to pass the failing tests.
- Preserve existing architecture and working functionality.
- Keep validation and authoritative data handling on the backend.
- Run relevant tests until they pass.
- Do not weaken security controls or tests just to obtain a passing result.

### REFACTOR — Improve and Verify

- Improve code quality only when necessary.
- Keep all tests passing.
- Run relevant unit/integration tests, regression tests, TypeScript checks, and production builds.
- Test responsive behavior at mobile and desktop sizes.
- Review the final diff for accidental changes to route optimization, authentication, schema, configuration, and secrets.
- Report the actual test results. Never claim a test passed unless it ran successfully.

---

## 16. Human-in-the-Loop (HITL)

- Inspect existing code before proposing changes.
- Present the implementation plan and wait for explicit approval ("go") before editing files.
- Request approval before database migrations, dependency installations, destructive commands, commits, pushes, merges, or deployments.
- Ask before paid API operations, paid storage, or any action that could incur costs.
- Explain unexpected failures and proposed changes before proceeding outside the approved scope.
- Never bypass failing tests simply to make the test suite pass.
- Do not modify or weaken tests without explaining why and obtaining approval.
- Do not make unapproved changes to authentication, database schemas, API contracts, or configurations.
- If the no-login requirement conflicts with safe handling of real customer information, stop and explain the risk instead of silently weakening security or adding login.

---

## 17. Prototype Boundaries

This instruction file governs **Mobile Delivery Confirmation only**.

Do not implement the following unless explicitly requested:

- TSP algorithm development or route optimization.
- Route creation, editing, assignment, or reordering.
- Live GPS tracking or continuous location sharing.
- Customer ordering, payment, or inventory management.
- A new login, authentication provider, account system, or password flow.
- Unapproved delivery status workflows unrelated to recording the confirmation.

Reuse existing order/ticket information only as needed to identify the delivery being confirmed. Keep the prototype modular so it can be integrated with the other prototypes later.

---

## 18. End-of-Session Summary

At the end of every development session, provide a clear summary in plain English.

Include:

- **Completed changes:** What was implemented.
- **Modified files:** Every file changed and why.
- **Database changes:** Migrations/schema changes made, or state that none were made.
- **Security changes:** Any security controls added or changed, plus known limitations.
- **Tests run:** Tests, TypeScript checks, and builds actually executed, with results.
- **Initially failing tests:** Which new tests failed during RED and why.
- **Unresolved issues:** Errors, incomplete work, and decisions still needed.
- **Recommended next steps:** The next small, practical task.
- **Git status:** State whether changes are local only, committed, pushed, or merged.
- **Deployment status:** State clearly whether anything was deployed. Do not deploy without approval.

Never claim that tests passed, files were committed, changes were pushed, or deployment succeeded unless those actions actually occurred.
