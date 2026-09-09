# Compatibility policy

Published OAuth contracts, encrypted provider credentials and passkeys are owned state. Once a
migration reaches a deployed instance, keep it immutable and add a new migration for schema
changes. Disposable test databases do not establish compatibility history. Preserve authorization
and encryption semantics across updates.
