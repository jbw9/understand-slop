(call target: (identifier) @kw (arguments (alias) @name) (#eq? @kw "defmodule")) @definition.module
(call target: (identifier) @kw (arguments (call target: (identifier) @name)) (#match? @kw "^(def|defp|defmacro|defmacrop)$")) @definition.function
(call target: (identifier) @kw (arguments (binary_operator left: (call target: (identifier) @name))) (#match? @kw "^(def|defp|defmacro|defmacrop)$")) @definition.function

(call target: (identifier) @name (#not-match? @name "^(def|defp|defmacro|defmacrop|defmodule|defstruct|defimpl|defprotocol|import|alias|require|use|if|unless|case|cond|with|for|raise|quote|unquote|fn)$")) @reference.call
(call target: (dot right: (identifier) @name)) @reference.call
