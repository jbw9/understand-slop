(trait_definition name: (identifier) @name) @definition.interface
(class_definition name: (identifier) @name) @definition.class
(object_definition name: (identifier) @name) @definition.class
(function_definition name: (identifier) @name) @definition.function

(call_expression function: (identifier) @name) @reference.call
(call_expression function: (field_expression field: (identifier) @name)) @reference.call

(extends_clause (type_identifier) @name) @reference.inherits
