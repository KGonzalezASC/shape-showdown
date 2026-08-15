# Define the isolated match-runtime boundary

Type: prototype
Status: open
Blocked by: 01, 02, 05

## Question

What interface lets the existing authoritative GameManager run many isolated matches safely inside one launch process and later run one or more matches inside regional containers? Prove match ownership, lifecycle, resource cleanup, protocol versioning, join-ticket validation, graceful drain, and authoritative snapshot resumption without rewriting the deterministic engine.
