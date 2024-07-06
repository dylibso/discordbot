export class Resource {
  static getSchema(): Object {
    throw new Error("Resource missing implementation for getSchema");
  }

  static _compiledSchema: Schema | null;

  /**
   * Holds a cached copy of the compiled
   * Schema object for this Resource.
   */
  static getCompiledSchema() {
    if (!this._compiledSchema) {
      this._compiledSchema = new Schema(this);
    }
    return this._compiledSchema;
  }

  /**
   * Can cast a plain js Object to a Resource
   * of this class type
   *
   * @param {Object} v - The plain js Object to cast
   */
  static cast(v: Object) {
    return this.getCompiledSchema().cast(v);
  }
}

/**
 * Represents a primitive:
 *   - String
 *   - Number
 *   - Boolean
 *   - Object (plain js object)
 *   - Array (of primitives only)
 */
class PrimitiveProperty {
  isValid(_value: any) {
    return true;
  }

  cast(value: any) {
    return value;
  }
}

/**
 * Represents a Date in the schema
 */
class DateProperty {
  isValid(value: any) {
    return typeof value === "string";
  }

  cast(value: any) {
    return new Date(value);
  }
}

/**
 * Represents an embedded Resource in the schema
 */
class ResourceProperty {
  type: any;

  constructor(type: any) {
    this.type = type;
  }

  isValid(value: any) {
    if (Array.isArray(value)) return false;
    return typeof value === "object";
  }

  cast(value: Object) {
    return this.type.cast(value);
  }
}

/**
 * Represents an array of other schema properties.
 *
 * @param {Property} type - Should be Property for element type
 */
class ArrayProperty {
  type: Property;

  constructor(type: Property) {
    this.type = type;
  }

  isValid(value: Array<Object>) {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return true;
    return this.type.isValid(value[0]);
  }

  cast(value: Array<Object>) {
    return value.map((v) => this.type.cast(v));
  }
}

class Property {
  isValid(_value: any) {
    throw new Error("implementation for isValid is missing");
  }

  cast(_value: any) {
    throw new Error("implementation for cast is missing");
  }

  /**
   * Factory method to build a Property from a type signature.
   * You should only create Properties through this method.
   */
  static build(typeSig: string): Property {
    let optional = false;
    if (typeSig.startsWith("?")) {
      optional = true;
      typeSig = typeSig.slice(1, typeSig.length);
    }

    if (typeSig.startsWith("Array")) {
      throw new Error("dont support array yet");
    }

    switch (typeSig) {
      case "string":
      case "number":
      case "boolean":
        return new PrimitiveProperty();
      case "date":
        return new DateProperty();
      default:
        return new ResourceProperty(Schema.locateResource(typeSig));
    }
  }
}

/**
 * The class responsible a compiled schema.
 *
 * @param {Resource} resourceType - the resource type
 */
export class Schema {
  type: any;
  properties: any;

  static locateResource(_name: string) {
    throw new Error("Schema.locateResource needs an implementation");
  }

  constructor(resourceType: any) {
    const options = resourceType.getSchema();
    this.type = resourceType;
    this.properties = {};
    Object.keys(options).forEach((name) => {
      this.properties[name] = Property.build(options[name]);
    });
  }

  cast(obj: Object) {
    const T = this.type;
    const resource = new T();

    for (let key in obj) {
      // @ts-ignore
      const value = obj[key];
      const propertyType = this.properties[key];

      if (propertyType) {
        // if it's a null, just set to null on the resource
        // null is a valid value for any property type
        if (value === null) {
          resource[key] = null;
        } else {
          // If it's valid, cast and set it
          if (propertyType.isValid(value)) {
            resource[key] = propertyType.cast(value);
            // TODO should we add a strict mode?
            // if it's not valid explode
            //throw new Error(`${T.name} could not map value pair ${key} => ${value} to schema type ${propertyType}`)
          }
          // else we leave resource[newKey] undefined
          // this prevents the programmer from accidentally relying on it
        }
      } else {
        // TODO should we add a strict mode?
        // if it's not valid explode
        //throw new Error(`${T.name} could not find schema property for value pair: ${key} => ${value}`)
      }
      // else we leave resource[newKey] undefined
      // this prevents the programmer from accidentally relying on it
    }

    return resource;
  }
}
