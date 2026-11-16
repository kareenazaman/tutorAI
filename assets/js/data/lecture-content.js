/**
 * TutorAI — mock SEED lecture content (extracted text)
 * ------------------------------------------------------------------
 * Stands in for the text the backend will extract from each uploaded
 * PDF (table: lecture_pages — lecture_id, page, heading, text).
 * api.js copies these into the mock store ("lectureContent") the first
 * time a page that loads this file runs. Page text is Markdown: maths
 * in $…$ / $$…$$, code in ~~~ fences.
 *
 * Only loaded by pages that read lecture text (lecture workspace and
 * AI Tutor). Keyed by lecture id; page numbers are 1-based by position.
 */
(function (T) {
  'use strict';
  const R = String.raw;
  // String.raw keeps the backslash in \` — strip it so Markdown sees real backticks
  const p = (heading, text) => ({ heading, text: text.trim().replace(/\\`/g, '`') });

  T.mockLectureContent = {
    /* ===================== COMP 3610 · Advanced Web Programming ===================== */
    lec_3001: [
      p('Course overview', R`
This course is about building the server side of web applications. You will write PHP that talks to a MySQL database, expose data through REST APIs and secure it with sessions and authentication.

By the end you should be able to design, build and deploy a small but complete web application.`),
      p('Clients and servers', R`
The web is a **client–server** system. A *client* (usually a browser) sends a request; a *server* receives it, does some work and sends back a response.

The server never contacts the client first. Every interaction starts with a request, which is why the request/response cycle is the most important idea in this course.`),
      p('Anatomy of a URL', R`
A URL tells the client where a resource lives.

- **Scheme** — \`https\`
- **Host** — \`tutorai.app\`
- **Port** — \`443\` (implied for HTTPS)
- **Path** — \`/courses/2001\`
- **Query string** — \`?tab=lectures\`

The path identifies the resource; the query string adds options such as filters or sorting.`),
      p('The request/response cycle', R`
1. The browser resolves the host name with DNS.
2. It opens a TCP connection and negotiates TLS for HTTPS.
3. It sends an HTTP request: a method, a path, headers and an optional body.
4. The server runs code (PHP in this course) and builds a response.
5. The browser renders the response body, often HTML, and fetches any linked CSS, JS and images.`),
      p('Static and dynamic pages', R`
A **static** page is a file sent exactly as it is stored. A **dynamic** page is generated per request, for example by PHP reading from a database.

Dynamic pages let each user see their own data, but every request costs server work, so caching and efficient queries matter.`),
      p('The LAMP stack', R`
We use the classic **LAMP** stack: Linux, Apache, MySQL and PHP. Apache receives the request, hands \`.php\` files to the PHP interpreter, and PHP connects to MySQL with PDO.

~~~php
<?php
$pdo = new PDO('mysql:host=localhost;dbname=tutorai', $user, $pass);
echo 'Connected';
~~~`),
      p('Developer tools', R`
The browser's developer tools are your best debugging friend. The **Network** tab shows every request with its method, status code, headers and timing. The **Console** shows JavaScript errors.

Check the Network tab first whenever a page "does nothing": the request may be failing with a 404 or 500.`)
    ],

    lec_3002: [
      p('What HTTP is', R`
HTTP (Hypertext Transfer Protocol) is a text-based, **stateless** protocol. Stateless means each request is independent: the server does not remember the previous request unless we add something such as a cookie or session.`),
      p('HTTP methods', R`
The method says what the client wants to do with a resource.

- **GET** — read a resource. Safe and idempotent.
- **POST** — create a resource or trigger an action. Not idempotent.
- **PUT** — replace a resource. Idempotent.
- **PATCH** — change part of a resource.
- **DELETE** — remove a resource. Idempotent.

*Idempotent* means sending the same request twice has the same effect as sending it once.`),
      p('Status codes', R`
Status codes are grouped by their first digit.

- **2xx success** — 200 OK, 201 Created, 204 No Content
- **3xx redirection** — 301 Moved Permanently, 304 Not Modified
- **4xx client error** — 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity
- **5xx server error** — 500 Internal Server Error, 503 Service Unavailable

Use 401 when the user is not signed in and 403 when they are signed in but not allowed.`),
      p('Headers', R`
Headers carry metadata about a request or response. Common ones:

- \`Content-Type: application/json\` — the format of the body
- \`Accept\` — formats the client can handle
- \`Authorization\` — credentials such as a bearer token
- \`Cache-Control\` — how long a response may be cached
- \`Set-Cookie\` / \`Cookie\` — how sessions travel between browser and server`),
      p('What makes an API RESTful', R`
REST (Representational State Transfer) is a style for designing APIs around **resources**. Each resource has a URL, and the HTTP method expresses the action.

Key constraints: client–server separation, statelessness, cacheable responses, and a uniform interface where URLs name *things*, not actions.`),
      p('Designing resource URLs', R`
Use plural nouns and nesting for ownership:

~~~text
GET    /api/courses              list courses
POST   /api/courses              create a course
GET    /api/courses/2001         one course
PATCH  /api/courses/2001         update part of it
DELETE /api/courses/2001         delete it
GET    /api/courses/2001/lectures lectures in a course
~~~

Avoid verbs in paths such as \`/getCourses\` — the method already says "get".`),
      p('JSON payloads', R`
Most modern APIs exchange **JSON**. Keep responses predictable with an envelope:

~~~json
{ "success": true, "data": { "id": "crs_2001", "code": "COMP 3610" } }
~~~

On errors, return a useful message and, for validation problems, the field that failed with status 422.`),
      p('Idempotency in practice', R`
Idempotency matters when networks fail. If a PUT times out, the client can safely retry it. Retrying a POST might create a duplicate, so APIs often accept an **idempotency key** header so the server can detect a repeated create.`)
    ],

    lec_3003: [
      p('Why sessions exist', R`
Because HTTP is stateless, the server cannot tell that two requests come from the same user. A **session** solves this: the server stores data for a visitor and gives the browser a random **session ID** in a cookie. The browser sends the cookie back with each request, and the server looks up the data.`),
      p('Starting a session in PHP', R`
Call \`session_start()\` before any output. PHP then reads the session cookie (named \`PHPSESSID\` by default) or creates a new session.

~~~php
<?php
session_start();
$_SESSION['user_id'] = 1001;
echo 'Signed in as user ' . $_SESSION['user_id'];
~~~

Data in \`$_SESSION\` stays on the server; only the ID travels in the cookie.`),
      p('Cookies and their flags', R`
Session cookies should be locked down:

- **HttpOnly** — JavaScript cannot read the cookie, which limits XSS damage.
- **Secure** — only sent over HTTPS.
- **SameSite=Lax** or **Strict** — not sent on most cross-site requests, which helps against CSRF.

~~~php
session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Lax']);
~~~`),
      p('Hashing passwords', R`
Never store plain-text passwords. Store a slow, salted **hash** using PHP's built-in functions:

~~~php
$hash = password_hash($password, PASSWORD_DEFAULT);
// later, at sign-in
if (password_verify($attempt, $hash)) { /* correct */ }
~~~

\`password_hash\` picks a strong algorithm (bcrypt or Argon2) and adds a random salt automatically.`),
      p('A login flow', R`
1. The user submits email and password over HTTPS.
2. Look up the user by email with a prepared statement.
3. Check the password with \`password_verify\`.
4. On success call \`session_regenerate_id(true)\` and store the user ID in the session.
5. Redirect to the dashboard. On failure, show one generic error: "Incorrect email or password".`),
      p('Session fixation and regeneration', R`
In a **session fixation** attack, an attacker tricks a victim into using a session ID the attacker already knows. If the ID stays the same after login, the attacker shares the signed-in session.

Calling \`session_regenerate_id(true)\` right after a successful login issues a fresh ID and destroys the old one.`),
      p('Protecting against CSRF', R`
Cross-Site Request Forgery tricks a signed-in browser into sending a request the user did not intend. Defences:

- Put a random **CSRF token** in each form and check it on POST.
- Use \`SameSite\` cookies.
- Never change data with GET requests.`),
      p('Logging out', R`
A complete logout clears the data, deletes the cookie and destroys the session:

~~~php
$_SESSION = [];
setcookie(session_name(), '', time() - 3600, '/');
session_destroy();
~~~`)
    ],

    lec_3004: [
      p('A REST API in PHP', R`
A PHP REST API is a set of endpoints that read JSON, talk to MySQL and return JSON. A **front controller** (one \`index.php\`) receives every request and routes it by method and path.`),
      p('Routing requests', R`
~~~php
<?php
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($method === 'GET' && $path === '/api/courses') {
    listCourses();
} elseif ($method === 'POST' && $path === '/api/courses') {
    createCourse();
} else {
    http_response_code(404);
}
~~~

Larger apps use a router library, but the idea is the same: match method + path, call a handler.`),
      p('Reading JSON input', R`
For JSON requests \`$_POST\` is empty. Read the raw body instead:

~~~php
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    exit;
}
~~~`),
      p('Returning JSON responses', R`
Set the status code and content type, then encode:

~~~php
function respond(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['success' => $status < 400, 'data' => $data]);
    exit;
}
~~~`),
      p('Prepared statements', R`
Never build SQL by joining strings with user input — that enables **SQL injection**. Use prepared statements with placeholders:

~~~php
$stmt = $pdo->prepare('SELECT * FROM courses WHERE user_id = ? AND id = ?');
$stmt->execute([$userId, $courseId]);
$course = $stmt->fetch(PDO::FETCH_ASSOC);
~~~`),
      p('Validation and error handling', R`
Validate every field on the server, even if the browser already did. Return **422** with the failing fields:

~~~json
{ "message": "Check the highlighted fields.", "errors": { "code": "Enter a course code." } }
~~~

Catch database exceptions and return a 500 without leaking SQL details to the client.`),
      p('Authentication for APIs', R`
Session-based APIs check \`$_SESSION['user_id']\` at the top of each protected endpoint and return **401** if it is missing. Always scope queries to the signed-in user so one student can never read another's courses — this is called *authorisation*.`),
      p('CORS basics', R`
Browsers block JavaScript from calling an API on a different origin unless the server allows it with **CORS** headers such as \`Access-Control-Allow-Origin\`. If the frontend and API share an origin, you don't need CORS at all.`)
    ],

    /* ===================== COMP 3410 · Database Systems ===================== */
    lec_3005: [
      p('Relations, tuples and attributes', R`
The **relational model** stores data in *relations* (tables). Each row is a *tuple* and each column an *attribute* with a domain (type). Row order does not matter, and every tuple must be unique.`),
      p('Keys', R`
- A **superkey** is any set of attributes that uniquely identifies a row.
- A **candidate key** is a minimal superkey.
- The **primary key** is the candidate key we choose.
- A **foreign key** references the primary key of another table, linking them.`),
      p('Integrity constraints', R`
Constraints keep data valid:

- **Entity integrity** — a primary key is never NULL.
- **Referential integrity** — a foreign key must match an existing row (or be NULL).
- **Domain constraints** — values must fit the attribute's type and checks.

~~~sql
CREATE TABLE lectures (
  id INT PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE
);
~~~`),
      p('Relational algebra: selection and projection', R`
**Selection** $\sigma$ keeps rows that satisfy a condition; **projection** $\pi$ keeps chosen columns.

$$\pi_{code,\,title}(\sigma_{term='Fall\ 2026'}(Courses))$$

In SQL this is \`SELECT code, title FROM courses WHERE term = 'Fall 2026'\`.`),
      p('Joins', R`
A **natural join** $\bowtie$ combines tuples from two relations that agree on common attributes. An *inner join* keeps only matches; *outer joins* keep unmatched rows too, filling missing values with NULL.

~~~sql
SELECT c.code, l.title
FROM courses c
JOIN lectures l ON l.course_id = c.id;
~~~`),
      p('From algebra to SQL', R`
SQL is declarative: you say *what* you want and the optimiser picks *how*. Internally, the query is translated into a relational algebra expression and rearranged — for example, applying selections before joins to shrink intermediate results.`)
    ],

    lec_3006: [
      p('Why normalize', R`
Poorly designed tables repeat data, which causes **anomalies**:

- *Update anomaly* — changing a fact in one row but not its copies.
- *Insertion anomaly* — not being able to add a fact without unrelated data.
- *Deletion anomaly* — losing a fact when deleting a row.

Normalization removes redundancy by splitting tables using functional dependencies.`),
      p('Functional dependencies', R`
A **functional dependency** $X \rightarrow Y$ means that rows with the same values of $X$ always have the same values of $Y$. For example, \`student_id → student_name\`.

Dependencies come from the meaning of the data, not from the current rows.`),
      p('First normal form (1NF)', R`
A table is in **1NF** when every attribute holds a single, atomic value — no lists or repeating groups in one cell. A column such as \`phones = "555-1234, 555-9876"\` breaks 1NF; move phone numbers into their own table.`),
      p('Second normal form (2NF)', R`
A table is in **2NF** if it is in 1NF and no non-key attribute depends on only *part* of a composite key (no **partial dependency**).

In \`Enrolment(student_id, course_id, course_title)\`, \`course_title\` depends only on \`course_id\`, so move it to a \`Courses\` table.`),
      p('Third normal form (3NF)', R`
A table is in **3NF** if it is in 2NF and no non-key attribute depends on another non-key attribute (no **transitive dependency**).

If \`student_id → advisor_id\` and \`advisor_id → advisor_office\`, then \`advisor_office\` belongs in an \`Advisors\` table.`),
      p('Boyce–Codd normal form (BCNF)', R`
**BCNF** is a stricter 3NF: for every non-trivial dependency $X \rightarrow Y$, $X$ must be a superkey. Most 3NF tables are already in BCNF; the exceptions involve overlapping candidate keys.`),
      p('Decomposition', R`
To normalize, **decompose** a table into smaller ones. A good decomposition is:

- **Lossless** — joining the pieces gives back exactly the original rows.
- **Dependency-preserving** — every dependency can still be checked within one table.

BCNF always allows a lossless decomposition but may not preserve every dependency; 3NF can guarantee both.`),
      p('Worked example', R`
Start with \`Orders(order_id, customer_id, customer_email, product_id, qty, price)\`.

1. \`order_id, product_id\` is the key.
2. \`customer_id → customer_email\` is transitive → \`Customers\` table.
3. \`product_id → price\` is partial → \`Products\` table.

~~~sql
CREATE TABLE order_items (order_id INT, product_id INT, qty INT, PRIMARY KEY (order_id, product_id));
~~~`)
    ],

    /* ===================== COMP 3520 · Machine Learning ===================== */
    lec_3007: [
      p('Supervised learning recap', R`
In **supervised learning** we learn a function from labelled examples $(x_i, y_i)$. When the target $y$ is a continuous number, the task is **regression**.`),
      p('The linear model', R`
Linear regression predicts with a weighted sum of the features:

$$\hat{y} = w_0 + w_1 x_1 + \dots + w_d x_d = \mathbf{w}^\top \mathbf{x}$$

$w_0$ is the intercept (bias) and each $w_j$ says how much the prediction changes when feature $x_j$ increases by one.`),
      p('Mean squared error', R`
We measure fit with the **mean squared error** over $n$ examples:

$$\text{MSE}(\mathbf{w}) = \frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2$$

Squaring makes all errors positive and punishes large errors more than small ones.`),
      p('The normal equation', R`
For linear regression the best weights have a closed form:

$$\mathbf{w}^* = (X^\top X)^{-1} X^\top \mathbf{y}$$

It is exact but costs about $O(d^3)$ to invert, so for many features we use gradient descent instead.`),
      p('Example: predicting study time', R`
Suppose $\hat{y} = 2 + 0.5x$, where $x$ is lecture pages and $\hat{y}$ is hours of study. A 20-page lecture predicts $2 + 0.5 \times 20 = 12$ hours.

~~~python
import numpy as np
X = np.array([[1, 10], [1, 20], [1, 30]])
y = np.array([7, 12, 17])
w = np.linalg.solve(X.T @ X, X.T @ y)   # [2.0, 0.5]
~~~`),
      p('Evaluating a regression model', R`
Report error on a **held-out test set**, not the training data. Common metrics:

- **RMSE** $= \sqrt{\text{MSE}}$, in the same units as $y$
- **$R^2$** — the share of variance explained, where 1 is perfect

A large gap between training and test error suggests **overfitting**.`),
      p('Assumptions and limits', R`
Linear regression assumes a roughly linear relationship, independent errors and constant error variance. Outliers can pull the line strongly because errors are squared. Adding polynomial features lets a linear model fit curves.`)
    ],

    lec_3008: [
      p('Why gradient descent', R`
When there is no closed-form solution, or the data is too large to invert $X^\top X$, we **minimise the loss iteratively**. Gradient descent repeatedly takes small steps downhill on the loss surface.`),
      p('The update rule', R`
At each step we move the weights against the gradient:

$$\mathbf{w} \leftarrow \mathbf{w} - \eta \, \nabla_{\mathbf{w}} L(\mathbf{w})$$

$\eta$ is the **learning rate**. The gradient points uphill, so subtracting it moves towards lower loss.`),
      p('Gradient of MSE', R`
For linear regression with MSE the gradient is:

$$\nabla_{\mathbf{w}} \text{MSE} = -\frac{2}{n} X^\top (\mathbf{y} - X\mathbf{w})$$

Each step uses the current residuals $\mathbf{y} - X\mathbf{w}$ to decide which way to move.`),
      p('Choosing the learning rate', R`
- **Too small** — progress is very slow.
- **Too large** — steps overshoot and the loss can diverge.
- **Just right** — the loss falls quickly and then levels off.

Plot the loss per epoch: a smooth decreasing curve means a good learning rate.`),
      p('Batch, stochastic and mini-batch', R`
- **Batch GD** uses all $n$ examples per step: stable but slow on big data.
- **Stochastic GD (SGD)** uses one example per step: fast and noisy.
- **Mini-batch GD** uses small batches (e.g. 32): the usual compromise, and it suits GPUs.`),
      p('Implementation', R`
~~~python
def gradient_descent(X, y, lr=0.01, epochs=1000):
    w = np.zeros(X.shape[1])
    for _ in range(epochs):
        residual = y - X @ w
        grad = -2 / len(y) * X.T @ residual
        w -= lr * grad
    return w
~~~`),
      p('Convergence', R`
For convex losses such as MSE, gradient descent with a small enough learning rate converges to the global minimum. Stop when the change in loss falls below a tolerance or after a fixed number of epochs. **Feature scaling** (standardising each feature) makes convergence much faster.`),
      p('Beyond plain gradient descent', R`
Momentum adds a fraction of the previous step to smooth out zig-zags. Adaptive methods such as **Adam** keep a per-weight learning rate. These are the default optimisers for training neural networks.`)
    ],

    /* ===================== STAT 2000 · Probability & Statistics ===================== */
    lec_3009: [
      p('Probability refresher', R`
A probability $P(A)$ is a number between 0 and 1. For any events, $P(A \cup B) = P(A) + P(B) - P(A \cap B)$, and the complement rule gives $P(A^c) = 1 - P(A)$.`),
      p('Conditional probability', R`
The probability of $A$ **given** that $B$ has happened is

$$P(A \mid B) = \frac{P(A \cap B)}{P(B)}, \quad P(B) > 0$$

Conditioning shrinks the sample space to the outcomes where $B$ is true.`),
      p('The multiplication rule', R`
Rearranging the definition gives the **multiplication rule**:

$$P(A \cap B) = P(A \mid B)\,P(B) = P(B \mid A)\,P(A)$$

It is how we compute the probability of a sequence of events, such as drawing two aces in a row.`),
      p('Independence', R`
Events $A$ and $B$ are **independent** if knowing one tells you nothing about the other:

$$P(A \mid B) = P(A) \iff P(A \cap B) = P(A)\,P(B)$$

Independent is not the same as mutually exclusive: exclusive events with positive probability are always *dependent*.`),
      p('The law of total probability', R`
If $B_1, \dots, B_k$ split the sample space into disjoint pieces,

$$P(A) = \sum_{i=1}^{k} P(A \mid B_i)\,P(B_i)$$

Use it when $A$ is easier to analyse within each case $B_i$.`),
      p('Worked example: drawing cards', R`
Draw two cards without replacement. Probability both are aces:

$$P(A_1 \cap A_2) = P(A_1)\,P(A_2 \mid A_1) = \frac{4}{52} \times \frac{3}{51} = \frac{1}{221} \approx 0.0045$$

The second probability changes because one ace is already gone — the draws are not independent.`),
      p('Tree diagrams', R`
A **tree diagram** lays out conditional probabilities branch by branch. Multiply along a path to get the probability of that sequence; add the paths that lead to the event you want. Trees are the easiest way to set up total-probability and Bayes problems.`)
    ],

    /* ===================== COMP 2680 · Web Site Design (archived) ===================== */
    lec_3011: [
      p('What semantic HTML means', R`
**Semantic HTML** uses elements for their meaning, not their look. A \`<nav>\` says "this is navigation"; a \`<div class="nav">\` says nothing. Meaning helps screen readers, search engines and other developers.`),
      p('Page landmarks', R`
~~~html
<header>…</header>
<nav aria-label="Main">…</nav>
<main>…</main>
<aside>…</aside>
<footer>…</footer>
~~~

Screen-reader users jump between these landmarks, so use exactly one \`<main>\` per page.`),
      p('Headings and outline', R`
Use one \`<h1>\` for the page title and nest \`<h2>\`–\`<h6>\` in order without skipping levels. Many screen-reader users navigate by headings, so the outline should read like a table of contents.`),
      p('Article and section', R`
- \`<article>\` is self-contained content that would make sense on its own, such as a blog post.
- \`<section>\` groups related content and usually has a heading.

If you just need a styling hook, use a \`<div>\`.`),
      p('Accessible forms', R`
Every input needs a \`<label>\` connected with \`for\`/\`id\`. Group related controls with \`<fieldset>\` and \`<legend>\`, and use the right input \`type\` (email, number, date) for better keyboards on mobile.`),
      p('Buttons versus links', R`
A **link** (\`<a href>\`) goes somewhere; a **button** does something on the current page. Using a \`<div>\` with a click handler breaks keyboard access — buttons and links are focusable and work with Enter or Space for free.`)
    ]
  };
})(window.TutorAI = window.TutorAI || {});
