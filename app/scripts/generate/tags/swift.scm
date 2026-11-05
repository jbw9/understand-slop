(class_declaration name: (type_identifier) @name) @definition.class
(protocol_declaration name: (type_identifier) @name) @definition.interface
(function_declaration name: (simple_identifier) @name) @definition.function
(protocol_function_declaration name: (simple_identifier) @name) @definition.method

(call_expression (simple_identifier) @name) @reference.call
(call_expression (navigation_expression suffix: (navigation_suffix suffix: (simple_identifier) @name))) @reference.call

(inheritance_specifier inherits_from: (user_type (type_identifier) @name)) @reference.inherits
