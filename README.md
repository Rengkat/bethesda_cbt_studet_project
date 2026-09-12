# CBT App (for blind students)

A simple Computer Based Test app. Plain HTML/CSS/JS on the frontend,
Node.js + Express + MongoDB on the backend. Built to be screen-reader
friendly: semantic headings, real `<label>`s, `fieldset`/`legend` for
answer choices, strong visible focus outlines, and `aria-live` regions
so messages and errors are announced automatically.

Login state is handled with **JSON Web Tokens (JWT) stored in the
browser's `localStorage`** — not cookies/sessions. Every frontend `.js`
file has a comment above each line explaining what that line does, since
students will be working directly in these files to learn how to
consume an API.

## 1. Deployment layout

This project is split into two pieces that are hosted **separately**:

- **`CBT_BACKEND/`** — the Node/Express API. Deploy this to something like
  Render, Railway, Fly.io, or a VPS. It exposes `/api/admin/*` and
  `/api/student/*`.
- **`public/`** — the plain HTML/CSS/JS frontend. Deploy this to any static
  host: Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3, etc. It no
  longer needs the backend server to serve it.

They talk to each other over the network (CORS), not by being served from
the same origin, so each side needs one piece of configuration pointing at
the other:

- **Frontend → backend**: edit `public/js/config.js` and set `API_BASE_URL`
  to your deployed backend's URL, e.g.
  `const API_BASE_URL = "https://cbt-backend.onrender.com";`
- **Backend → frontend**: set the `FRONTEND_URL` env var (see below) to your
  deployed frontend's URL, so the backend's CORS policy allows requests from it.

## 2. Requirements

- Node.js (v18 or newer recommended)
- MongoDB running locally, or a MongoDB Atlas connection string

## 3. Backend setup

```bash
cd CBT_BACKEND
npm install
cp .env.example .env
```

Open `.env` and set:
- `MONGO_URI` — your MongoDB connection string
- `JWT_SECRET` — any long random string (used to sign/verify login tokens)
- `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` — used once to create the first admin
- `FRONTEND_URL` — the URL(s) your frontend is served from, comma-separated
  if you have more than one (e.g. a local dev server and your production
  deployment). This is required for CORS to allow the frontend to call the API.

Create the first admin account:

```bash
npm run seed
```

Start the app:

```bash
npm start
```

The API is now running at `http://localhost:3000` (or whatever host/port you
deploy it to). You can sanity-check it's up by visiting `/api/health`.

## 4. Frontend setup

The `public/` folder is a fully static site — no build step. Before deploying
it (or opening it locally), edit `public/js/config.js`:

```js
const API_BASE_URL = "https://your-backend-domain.com"; // no trailing slash
```

Then serve the `public/` folder with any static host, or open it locally
with something like the VS Code "Live Server" extension (don't just
double-click the HTML files — `fetch()` requests work more reliably served
over `http://` than `file://`). Whatever local URL it runs on (e.g.
`http://localhost:5500`) needs to be added to the backend's `FRONTEND_URL`.

## 3. How login works (token-based, using localStorage)

1. The student or admin submits the login form.
2. The frontend sends a `POST` request with their credentials.
3. If correct, the server sends back a `token` (a signed JWT) in the JSON response.
4. The frontend saves that token with `localStorage.setItem('token', data.token)`.
5. On every later request, `apiRequest()` (in `public/js/helpers.js`) reads the
   token back out of `localStorage` and attaches it as:
   `Authorization: Bearer <token>`
6. The backend middleware (`middleware/auth.js`) checks that header, verifies
   the token, and only then lets the request reach a protected route.
7. "Logging out" is just `localStorage.removeItem('token')` on the frontend —
   there's no server-side session to destroy, since JWTs are stateless.

Tokens expire after 4 hours (`expiresIn: '4h'` in the login routes) — after
that, the user has to log in again.

## 4. How the app works

**Admin** (`/admin-login.html`):
- Log in / log out
- Add, edit, delete students (each student gets a registration number + password + class)
- Add an exam: title, subject, class, duration (minutes), and a list of questions
  (each question can have an optional passage, question text, a flexible number
  of options — add/remove per question — and one correct answer)
- Add questions one at a time by hand, **or** bulk-import them from a CSV
  file — both when creating an exam and when adding more questions to an
  existing one later. See `questions-sample.csv` for the expected columns
  (`question, passage, answer, option1..option6`); `passage` and
  `option3`-`option6` are optional, everything else is required, and
  `answer` must match one of that row's options exactly. The whole file is
  validated before anything is saved, and any problem rows are reported
  with their row number so they're easy to fix and re-upload.
- View all submitted results

**Student** (`/student-login.html`):
- Log in with registration number + password
- See only the exams that match their class
- Take an exam (one question per section, native radio buttons, optional passage
  shown above the question, and a countdown timer that auto-submits when time
  runs out) and submit it once — each exam can only be submitted once per student
- See their score immediately after submitting

## 5. Project structure

```
CBT_BACKEND/                 deployed as its own service
  server.js                    entry point (CORS-enabled API only, no longer serves the frontend)
  seed.js                      creates the first admin account
  config/db.js                 MongoDB connection
  models/                      Mongoose schemas (Admin, Student, Exam, Result)
  middleware/auth.js           verifies the JWT sent in the Authorization header
  middleware/upload.js         multer config for the CSV bulk-question upload
  utils/parseQuestionsCsv.js   parses + validates an uploaded questions CSV
  routes/adminRoutes.js        all /api/admin/* routes
  routes/studentRoutes.js      all /api/student/* routes
  questions-sample.csv         template for bulk-importing exam questions

public/                      deployed separately as a static site
  js/config.js                  sets API_BASE_URL — the one thing to edit per deployment
  js/helpers.js                 shared apiRequest()/showMessage()/clearMessage() — attaches the token
                                 automatically and prefixes relative URLs with API_BASE_URL
  js/admin-*.js                 one file per admin page
  js/student-*.js               one file per student page
```

## 6. Notes

- Passwords are hashed with bcrypt before being stored.
- Validation is intentionally basic (required fields, matching answer to an option,
  no duplicate registration numbers, one submission per exam) — enough to keep the
  data clean without adding complexity.
- Every frontend JS file uses template literals (`` `like this ${value}` ``) instead
  of string concatenation with `+`, and has a plain-English comment above each line.
- To add more admins later, either run `seed.js` again with different `.env` values
  before running it (it only creates the account if that username doesn't exist yet),
  or insert directly into the `admins` collection with a bcrypt-hashed password.
