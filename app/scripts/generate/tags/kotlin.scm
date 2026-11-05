(class_declaration (type_identifier) @name) @definition.class
(object_declaration (type_identifier) @name) @definition.class
(function_declaration (simple_identifier) @name) @definition.function

(call_expression (simple_identifier) @name) @reference.call
(call_expression (navigation_expression (navigation_suffix (simple_identifier) @name))) @reference.call

(delegation_specifier (constructor_invocation (user_type (type_identifier) @name))) @reference.inherits
(delegation_specifier (user_type (type_identifier) @name)) @reference.inherits
