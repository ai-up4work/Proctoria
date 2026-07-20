// lib/mockQuestions.ts
//
// Mock question bank for the exam-sit page. Swap `getExamQuestions` for a
// real fetch/API call when wiring up an actual backend — the page only
// depends on the `Question` shape and the `MOCK_QUESTIONS` export below.

export interface Question {
  id: string;
  text: string;
  options: string[];
}

export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1",
    text: "What is the time complexity of binary search?",
    options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
  },
  {
    id: "q2",
    text: "Which HTTP method is idempotent?",
    options: ["POST", "PUT", "PATCH", "CONNECT"],
  },
  {
    id: "q3",
    text: "React hooks must be called…",
    options: ["Conditionally", "Inside loops", "At the top level", "Inside classes"],
  },
  {
    id: "q4",
    text: "Which data structure uses LIFO ordering?",
    options: ["Queue", "Stack", "Linked List", "Heap"],
  },
  {
    id: "q5",
    text: "In SQL, which clause filters rows after aggregation?",
    options: ["WHERE", "GROUP BY", "HAVING", "ORDER BY"],
  },
  {
    id: "q6",
    text: "What does CSS `flex-grow: 1` do to a flex item?",
    options: [
      "Fixes its width",
      "Allows it to shrink only",
      "Allows it to expand and fill available space",
      "Hides overflow content",
    ],
  },
  {
    id: "q7",
    text: "Which of these is NOT a valid HTTP status code category?",
    options: ["1xx Informational", "2xx Success", "4xx Client Error", "6xx Server Error"],
  },
  {
    id: "q8",
    text: "What is the primary purpose of a load balancer?",
    options: [
      "Encrypt traffic between client and server",
      "Distribute incoming requests across multiple servers",
      "Cache static assets closer to users",
      "Validate user authentication tokens",
    ],
  },
  {
    id: "q9",
    text: "In Git, what does `git rebase` primarily do?",
    options: [
      "Merges two branches with a merge commit",
      "Deletes a branch permanently",
      "Reapplies commits on top of another base commit",
      "Reverts the last commit",
    ],
  },
  {
    id: "q10",
    text: "Which sorting algorithm has the best average-case time complexity?",
    options: [
      "Bubble Sort — O(n²)",
      "Quicksort — O(n log n)",
      "Selection Sort — O(n²)",
      "Insertion Sort — O(n²)",
    ],
  },
  {
    id: "q11",
    text: "What does the acronym REST stand for in RESTful APIs?",
    options: [
      "Remote Execution State Transfer",
      "Representational State Transfer",
      "Relational Entity Structure Transaction",
      "Resource Endpoint Service Type",
    ],
  },
  {
    id: "q12",
    text: "Which of these is a NoSQL database?",
    options: ["PostgreSQL", "MySQL", "MongoDB", "SQLite"],
  },
  {
    id: "q13",
    text: "What is the main advantage of using an index in a database table?",
    options: [
      "It reduces the size of the table on disk",
      "It speeds up read queries at the cost of extra write overhead",
      "It automatically normalizes the data",
      "It encrypts the column values",
    ],
  },
  {
    id: "q14",
    text: "In JavaScript, what does the `===` operator check that `==` does not?",
    options: [
      "Whether both values are truthy",
      "Whether both values are objects",
      "Whether both value and type match, without coercion",
      "Whether both values are functions",
    ],
  },
  {
    id: "q15",
    text: "Which caching strategy serves stale content while fetching a fresh copy in the background?",
    options: ["Cache-aside", "Write-through", "Stale-while-revalidate", "Write-behind"],
  },
  {
    id: "q16",
    text: "What problem does a CDN primarily solve?",
    options: [
      "Reduces latency by serving content from locations closer to users",
      "Encrypts data at rest",
      "Replaces the need for a database",
      "Compiles JavaScript to machine code",
    ],
  },
  {
    id: "q17",
    text: "Which of the following best describes eventual consistency?",
    options: [
      "All nodes always return the same data instantly",
      "Data will converge to the same value across nodes, given enough time without new updates",
      "Data is never replicated",
      "Writes are rejected until all nodes agree",
    ],
  },
  {
    id: "q18",
    text: "What is the purpose of a JWT's signature?",
    options: [
      "To encrypt the payload so it can't be read",
      "To compress the token for smaller size",
      "To verify the token hasn't been tampered with",
      "To store the user's password securely",
    ],
  },
  {
    id: "q19",
    text: "In CSS, which property creates a new stacking context when set to a value other than `visible`?",
    options: ["display", "position", "overflow", "z-index"],
  },
  {
    id: "q20",
    text: "What does the `useEffect` cleanup function primarily prevent?",
    options: [
      "Component re-renders",
      "Memory leaks and stale subscriptions/listeners",
      "State updates from firing at all",
      "CSS from being applied twice",
    ],
  },
];