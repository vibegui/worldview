# Product

## Register

product

## Platform

MCP app (Cloudflare Worker), used through deco studio or any MCP client

## Users

One person per deployment. Someone who has more projects than attention, who can state what they want but keeps losing the thread between what they declared and what they are actually doing. They already have tools that execute — an editor, agents, a software factory. What they lack is the layer above those tools.

## Product Purpose

Worldview answers three questions:

1. **What is my life about?** The declared future, kept in git.
2. **What game am I playing?** The projects, goals, and milestones that serve it, plus the conditions of satisfaction that make winning worth it.
3. **Am I playing it well?** Two scores: alignment and integrity.

The gap between what should be and what is *is* the work. Everything downstream — research, validation, building, shipping, telling people — is machinery for closing it. Worldview owns the declaration and the measurement, and hands the gap to whatever executes.

Success means the owner opens a session and gets a ranked list of what matters with the evidence that exposed it, instead of a blank box asking what they want to do today.

## Positioning

The layer above the software factory. Your declared future in git, and the two scores that say whether you are living into it.

## Anti-references

Not a task manager, not a habit tracker, not a dashboard of vanity metrics, not an OKR tool that rots in a tab. No streaks, no gamification, no productivity scoring of the person.

**Above all: not an executor.** Worldview declares, measures, and scores. It never writes code, opens a pull request, publishes a post, or ships anything.

## Design Principles

1. **The declaration lives in git.** `worldview.json` holds what should be. Changing your future is a commit, so it is reviewable and forkable rather than an untracked edit at 2am. D1 holds only what is.
2. **Never execute.** If a proposed tool takes an action with a consequence, it belongs in the factory, not here. This is what makes one deployment safe to connect to several factories at once — a scorekeeper with no hands.
3. **An idea is not an input.** It is the gap between a declaration and a measurement. Derive the queue; never ask the user to think of the work.
4. **Two scores, and only two.** Alignment and integrity. Anything else is diagnostic detail beneath one of them.
5. **Integrity is positive, not moral.** Whole and complete, in three domains: word, systems, objects. A missed commitment is not the breach — leaving it unacknowledged is.
6. **No number without evidence.** Every claim cites the measurement or the artifact that produced it. A green check nobody can open is a rumor.
7. **One deployment is one person.** No multi-tenancy. Private and public are separate by construction.
8. **Nothing publishes itself.** Human direction remains sovereign.

## The two scores

**Alignment** — does what I am doing serve the future I declared. Measured as the share of active work traceable to a declared outcome.

**Integrity** — is it whole and complete, in my word, my systems, and my objects. Measured as a **count of unacknowledged commitments, target zero**. Never a percentage: integrity is a mountain with no top, so a progress bar on it is a category error.

## Accessibility & Inclusion

Semantic HTML, keyboard-operable controls, readable contrast, text labels for every state. No status conveyed by color alone.

## Attribution

The integrity and created-future distinctions come from the ontological leadership work of Werner Erhard, Michael C. Jensen, Steve Zaffron, and Kari Granger. See `NOTICE`.
