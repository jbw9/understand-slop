(class_declaration
  name: (identifier) @name) @definition.class

(method_declaration
  name: (identifier) @name) @definition.method

(method_invocation
  name: (identifier) @name
  arguments: (argument_list) @reference.call)

(interface_declaration
  name: (identifier) @name) @definition.interface

(type_list
  (type_identifier) @name) @reference.implementation

(object_creation_expression
  type: (type_identifier) @name) @reference.class

(superclass (type_identifier) @name) @reference.class

; Inheritance (added for graph.ts)
(superclass (type_identifier) @name) @reference.inherits
(super_interfaces (type_list (type_identifier) @name)) @reference.inherits
(extends_interfaces (type_list (type_identifier) @name)) @reference.inherits
