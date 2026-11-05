(class_definition name: (identifier) @name) @definition.class
(program (function_signature name: (identifier) @name) @definition.function)
(class_body (method_signature (function_signature name: (identifier) @name)) @definition.method)

(_ (identifier) @name . (selector (argument_part))) @reference.call
(_ (selector (unconditional_assignable_selector (identifier) @name)) . (selector (argument_part))) @reference.call

(superclass (type_identifier) @name) @reference.inherits
(interfaces (type_identifier) @name) @reference.inherits
