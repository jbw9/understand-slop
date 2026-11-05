; A component used in markup is a call to it: <Card /> renders Card.
; Lowercase tags are HTML elements, not code in the repository.
; Added to the tags query of every grammar that parses JSX (graph.ts, JSX).

(jsx_opening_element
  name: (identifier) @name
  (#match? @name "^[A-Z]")) @reference.call

(jsx_self_closing_element
  name: (identifier) @name
  (#match? @name "^[A-Z]")) @reference.call
