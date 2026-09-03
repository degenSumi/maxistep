
PRD- 
* To build a customer support agent for a shoe company
* to build agent to handle customer queries
* handle failures
* write agent evals


Data sources -
* Mock data - Neon Postgres with Seeded data
* llm agnostic - model swappable - go with gemini flash 3.5 lite


Task - 
* Build an agentic system; that caters a shoe company customer enquiries.
* a turborepo monorepo system with hono
* a frontend for demo
* Use Vercel AI SDK
* Model agnostic- ship with free tier gemini 3.5 flash
* fallback model; openrouter gemini flash free tier
* handle failures; and encapsulate the model ai sdk calls behind a fallback wrapper
* evals- from fundamentals
* use PostgresSQL behind a neon instance- i will give you the creds
* Seed mock data for shoe store
* secrets env never commited
* everything deploys to vercel - FE + BE(as a serverless function)




