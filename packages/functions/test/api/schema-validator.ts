import { z } from "zod";
import { routes } from "../../src/api/routes";
import { Resource } from "sst";

type OpenAPISchema = {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  allOf?: any[];
  oneOf?: any[];
  anyOf?: any[];
  items?: any;
  $ref?: string;
  [key: string]: any;
};

type OpenAPIDocument = {
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
  paths?: Record<string, Record<string, any>>;
};

/**
 * Extracts OpenAPI schemas from Hono routes for validation
 */
export class SchemaValidator {
  private static schemaCache = new Map<
    string,
    OpenAPISchema | z.ZodType | undefined
  >();
  private static responsesCache = new Map<string, number[]>();
  private static openAPIDoc: OpenAPIDocument | null = null;
  private static fetchPromise: Promise<void> | null = null;

  /**
   * Get the response status codes supported by a route
   */
  static async getRouteResponseStatusCodes(
    path: string,
    method: string = "get",
  ): Promise<number[]> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const normalizedMethod = method.toLowerCase();
    const cacheKey = `${normalizedMethod}:${normalizedPath}`;

    if (this.responsesCache.has(cacheKey)) {
      return this.responsesCache.get(cacheKey)!;
    }

    try {
      // Find the matching route in the Hono app
      const route = this.findMatchingRoute(normalizedPath, normalizedMethod);

      if (route && route.handler) {
        // Get all symbols on the handler
        const symbols = Object.getOwnPropertySymbols(route.handler);

        // Find the openapi metadata
        for (const sym of symbols) {
          // @ts-expect-error
          const metadata = route.handler[sym];

          if (
            metadata &&
            metadata.resolver &&
            typeof metadata.resolver === "function"
          ) {
            try {
              const result = metadata.resolver({}, {});

              // If resolver returns a Promise
              if (result instanceof Promise) {
                const resolved = await result;

                if (resolved.docs && resolved.docs.responses) {
                  const statusCodes = Object.keys(resolved.docs.responses).map(
                    (c) => parseInt(c),
                  );
                  this.responsesCache.set(cacheKey, statusCodes);
                  return statusCodes;
                }
              }
              // If resolver returns a direct result
              else if (result && result.docs && result.docs.responses) {
                const statusCodes = Object.keys(result.docs.responses).map(
                  (c) => parseInt(c),
                );
                this.responsesCache.set(cacheKey, statusCodes);
                return statusCodes;
              }
            } catch (error) {
              console.error(
                `Error resolving OpenAPI metadata for ${cacheKey}:`,
                error,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error extracting status codes for ${cacheKey}:`, error);
    }

    // If we can't find or extract the schema, return an empty array
    return [];
  }

  /**
   * Get the schema for a specific route and method
   */
  static async getRouteSchema(
    path: string,
    method: string = "get",
    statusCode: number = 200,
  ): Promise<OpenAPISchema | z.ZodType | undefined> {
    // Normalize inputs
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const normalizedMethod = method.toLowerCase();
    const cacheKey = `${normalizedMethod}:${normalizedPath}:${statusCode}`;

    // Check cache first
    if (this.schemaCache.has(cacheKey)) {
      return this.schemaCache.get(cacheKey);
    }

    try {
      // Find the matching route in the Hono app
      const route = this.findMatchingRoute(normalizedPath, normalizedMethod);

      if (route && route.handler) {
        // Get all symbols on the handler
        const symbols = Object.getOwnPropertySymbols(route.handler);

        // Find the openapi metadata
        for (const sym of symbols) {
          // @ts-expect-error
          const metadata = route.handler[sym];

          if (
            metadata &&
            metadata.resolver &&
            typeof metadata.resolver === "function"
          ) {
            try {
              const result = metadata.resolver({}, {});

              // If resolver returns a Promise
              if (result instanceof Promise) {
                const resolved = await result;

                if (
                  resolved.docs &&
                  resolved.docs.responses &&
                  resolved.docs.responses[statusCode]
                ) {
                  const responseContent =
                    resolved.docs.responses[statusCode].content;
                  if (
                    responseContent &&
                    responseContent["application/json"]?.schema
                  ) {
                    const schema = responseContent["application/json"].schema;
                    this.schemaCache.set(cacheKey, schema);
                    return schema;
                  }
                }
              }
              // If resolver returns a direct result
              else if (
                result &&
                result.docs &&
                result.docs.responses &&
                result.docs.responses[statusCode]
              ) {
                const responseContent =
                  result.docs.responses[statusCode].content;
                if (
                  responseContent &&
                  responseContent["application/json"]?.schema
                ) {
                  const schema = responseContent["application/json"].schema;
                  this.schemaCache.set(cacheKey, schema);
                  return schema;
                }
              }
            } catch (error) {
              console.error(
                `Error resolving OpenAPI metadata for ${cacheKey}:`,
                error,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error extracting schema for ${cacheKey}:`, error);
    }

    // If we can't find or extract the schema, return undefined
    return undefined;
  }

  /**
   * Find a matching route in the Hono app based on path and method
   */
  private static findMatchingRoute(path: string, method: string) {
    // Get all routes from the Hono app
    const routesArray = routes.routes || [];

    // First try to find an exact match
    const exactMatch = routesArray.find(
      (r) => r.path === path && r.method?.toLowerCase() === method,
    );

    if (exactMatch) return exactMatch;

    // If no exact match, try to match using parameter pattern
    for (const route of routesArray) {
      // Skip if method doesn't match
      if (route.method?.toLowerCase() !== method) continue;

      // Convert route path pattern to regex pattern
      // E.g., "/users/:id" becomes "/users/[^/]+"
      const pathPattern = route.path.replaceAll(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pathPattern}$`);

      if (regex.test(path)) {
        return route;
      }
    }

    return null;
  }

  /**
   * Fetch the full OpenAPI spec document
   */
  static async fetchOpenAPISpec(): Promise<void> {
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = (async () => {
      try {
        console.log("Fetching OpenAPI spec from API...");
        const response = await fetch(Resource.Urls.openapi);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
          );
        }

        this.openAPIDoc = (await response.json()) as OpenAPIDocument;

        // Debug info to help verify schema loading
        const schemaCount = Object.keys(
          this.openAPIDoc?.components?.schemas || {},
        ).length;
        console.log(
          `OpenAPI spec fetched successfully with ${schemaCount} schema definitions`,
        );

        // Log some of the available schemas for debugging
        const schemaNames = Object.keys(
          this.openAPIDoc?.components?.schemas || {},
        ).slice(0, 10);
        console.log(`Available schemas include: ${schemaNames.join(", ")}`);
      } catch (error) {
        console.error("Error fetching OpenAPI spec:", error);
        throw error;
      }
    })();

    return this.fetchPromise;
  }

  /**
   * Resolve a schema that may contain $ref references
   */
  private static resolveSchema(
    schema: OpenAPISchema,
    refChain: string[] = [],
  ): OpenAPISchema {
    if (!schema) return schema;

    // If schema has a $ref, resolve it
    if (schema.$ref) {
      const refPath = schema.$ref;

      // Prevent circular references
      if (refChain.includes(refPath)) {
        console.warn(
          `Circular reference detected: ${refPath} in chain ${refChain.join(" -> ")}`,
        );
        return { ...schema, circularRef: true };
      }

      // Handle component refs like "#/components/schemas/ErrorResponse"
      if (refPath.startsWith("#/components/schemas/")) {
        const schemaName = refPath.split("/").pop()!;
        const referencedSchema =
          this.openAPIDoc?.components?.schemas?.[schemaName];

        if (referencedSchema) {
          console.log(
            `Resolving schema reference: ${refPath} -> ${schemaName}`,
          );

          // Clone the referenced schema to avoid modifying the original
          const clonedSchema = JSON.parse(JSON.stringify(referencedSchema));

          // Recursively resolve any nested references
          return this.resolveSchema(clonedSchema, [...refChain, refPath]);
        } else {
          console.warn(
            `Could not resolve schema reference: ${refPath}. Available schemas: ${Object.keys(
              this.openAPIDoc?.components?.schemas || {},
            )
              .slice(0, 5)
              .join(", ")}...`,
          );
          return { ...schema, unresolvedRef: true };
        }
      }

      console.warn(`Unknown reference format: ${refPath}`);
      return { ...schema, unknownRefFormat: true };
    }

    // Recursively resolve properties if this is an object schema
    if (schema.type === "object" && schema.properties) {
      const resolvedProperties: Record<string, any> = {};

      for (const [key, propSchema] of Object.entries(schema.properties)) {
        resolvedProperties[key] = this.resolveSchema(propSchema, refChain);
      }

      return {
        ...schema,
        properties: resolvedProperties,
      };
    }

    // Resolve items if this is an array schema
    if (schema.type === "array" && schema.items) {
      return {
        ...schema,
        items: this.resolveSchema(schema.items, refChain),
      };
    }

    // Resolve allOf, oneOf, anyOf schemas
    ["allOf", "oneOf", "anyOf"].forEach((key) => {
      if (schema[key] && Array.isArray(schema[key])) {
        schema[key] = schema[key].map((s: OpenAPISchema) =>
          this.resolveSchema(s, refChain),
        );
      }
    });

    return schema;
  }

  /**
   * Fallback response schemas by status code
   */
  static getFallbackSchema(statusCode: number): z.ZodType {
    switch (statusCode) {
      case 200:
        return z.object({
          data: z.any(),
        });
      case 400:
      case 401:
      case 403:
      case 404:
      case 429:
      case 500:
        return z.object({
          type: z.string(),
          code: z.string(),
          message: z.string(),
          param: z.string().optional(),
          details: z.any().optional(),
        });
      default:
        return z.any();
    }
  }

  /**
   * Validate data against an OpenAPI JSON Schema
   */
  private static validateOpenAPISchema(
    data: any,
    schema: OpenAPISchema,
    errors: string[] = [],
    path: string = "root",
  ): boolean {
    // Return early if schema is null or undefined
    if (!schema) {
      errors.push(`${path}: Schema is null or undefined`);
      return false;
    }

    // Handle schema references (should be resolved already, but just in case)
    if (schema.$ref) {
      const warning = `Schema still has unresolved $ref: ${schema.$ref}`;
      console.warn(warning);
      errors.push(`${path}: ${warning}`);
      return false; // Fail validation for unresolved refs
    }

    // Handle schema with special flags added during resolution
    if ("unresolvedRef" in schema) {
      errors.push(
        `${path}: Could not resolve schema reference: ${schema.$ref}`,
      );
      return false;
    }

    if ("circularRef" in schema) {
      errors.push(`${path}: Circular reference detected: ${schema.$ref}`);
      return false;
    }

    if ("unknownRefFormat" in schema) {
      errors.push(`${path}: Unknown reference format: ${schema.$ref}`);
      return false;
    }

    // Special case for schemas without a type but with properties (treat as object)
    if (!schema.type && schema.properties) {
      schema = { ...schema, type: "object" };
    }

    // Handle schemas with no type but with allOf
    if (!schema.type && schema.allOf) {
      // If schema has allOf, validate against all of the sub-schemas
      return schema.allOf.every((subSchema, i) =>
        this.validateOpenAPISchema(
          data,
          subSchema,
          errors,
          `${path}.allOf[${i}]`,
        ),
      );
    }

    // Handle other schemas with no type
    if (!schema.type) {
      // If schema has no type but has validation keywords, it's probably a constraint
      const hasConstraints =
        schema.enum ||
        schema.const ||
        schema.multipleOf ||
        schema.maximum ||
        schema.minimum ||
        schema.maxLength ||
        schema.minLength ||
        schema.pattern ||
        schema.format ||
        schema.maxItems ||
        schema.minItems;

      if (!hasConstraints) {
        // If no constraints either, we can't validate
        console.warn(
          `${path}: Schema has no type and no validation constraints:`,
          schema,
        );
        return true; // Skip validation
      }
    }

    // Handle allOf schemas (all schemas must match)
    if (schema.allOf && Array.isArray(schema.allOf)) {
      return schema.allOf.every((subSchema, i) =>
        this.validateOpenAPISchema(
          data,
          subSchema,
          errors,
          `${path}.allOf[${i}]`,
        ),
      );
    }

    // Handle oneOf schemas (at least one schema must match)
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
      const oneOfErrors: string[][] = [];
      const isValid = schema.oneOf.some((subSchema, i) => {
        const subErrors: string[] = [];
        const result = this.validateOpenAPISchema(
          data,
          subSchema,
          subErrors,
          `${path}.oneOf[${i}]`,
        );
        if (!result) {
          oneOfErrors.push(subErrors);
        }
        return result;
      });

      if (!isValid) {
        errors.push(`${path}: Data didn't match any schema in oneOf`);
        // Add all validation errors from each schema
        oneOfErrors.forEach((subErrors, i) => {
          subErrors.forEach((err) =>
            errors.push(`${path}.oneOf[${i}]: ${err}`),
          );
        });
      }

      return isValid;
    }

    // Handle anyOf schemas (at least one schema must match)
    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      const anyOfErrors: string[][] = [];
      const isValid = schema.anyOf.some((subSchema, i) => {
        const subErrors: string[] = [];
        const result = this.validateOpenAPISchema(
          data,
          subSchema,
          subErrors,
          `${path}.anyOf[${i}]`,
        );
        if (!result) {
          anyOfErrors.push(subErrors);
        }
        return result;
      });

      if (!isValid) {
        errors.push(`${path}: Data didn't match any schema in anyOf`);
        // Add all validation errors from each schema
        anyOfErrors.forEach((subErrors, i) => {
          subErrors.forEach((err) =>
            errors.push(`${path}.anyOf[${i}]: ${err}`),
          );
        });
      }

      return isValid;
    }

    // Validate by type
    if (schema.type === "object") {
      if (typeof data !== "object" || data === null) {
        const error = `${path}: Expected object but got: ${typeof data}`;
        console.warn(error);
        errors.push(error);
        return false;
      }

      let isValid = true;

      // Check required properties
      if (schema.required) {
        for (const prop of schema.required) {
          if (!(prop in data)) {
            const error = `${path}: Missing required property: ${prop}`;
            console.warn(error);
            errors.push(error);
            isValid = false;
          }
        }
      }

      // Check property types if properties are defined
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in data) {
            // For nested objects with $ref or nested properties, use validateOpenAPISchema recursively
            if (
              propSchema.$ref ||
              (propSchema.type === "object" && propSchema.properties) ||
              propSchema.allOf ||
              propSchema.oneOf ||
              propSchema.anyOf
            ) {
              if (
                !this.validateOpenAPISchema(
                  data[key],
                  propSchema,
                  errors,
                  `${path}.${key}`,
                )
              ) {
                isValid = false;
              }
            } else if (!this.validateProperty(data[key], propSchema)) {
              const error = `${path}.${key}: Failed property validation for ${JSON.stringify(data[key])}, expected ${propSchema.type || "unknown type"}`;
              console.warn(error);
              errors.push(error);
              isValid = false;
            }
          }
        }
      }

      // Check for additional properties if additionalProperties is false
      if (schema.additionalProperties === false) {
        const schemaProps = Object.keys(schema.properties || {});
        for (const key in data) {
          if (!schemaProps.includes(key)) {
            const error = `${path}: Additional property not allowed: ${key}`;
            console.warn(error);
            errors.push(error);
            isValid = false;
          }
        }
      }

      return isValid;
    } else if (schema.type === "array") {
      if (!Array.isArray(data)) {
        const error = `${path}: Expected array but got: ${typeof data}`;
        console.warn(error);
        errors.push(error);
        return false;
      }

      let isValid = true;

      // Check array length constraints
      if (schema.minItems !== undefined && data.length < schema.minItems) {
        const error = `${path}: Array has fewer items (${data.length}) than required (${schema.minItems})`;
        console.warn(error);
        errors.push(error);
        isValid = false;
      }

      if (schema.maxItems !== undefined && data.length > schema.maxItems) {
        const error = `${path}: Array has more items (${data.length}) than allowed (${schema.maxItems})`;
        console.warn(error);
        errors.push(error);
        isValid = false;
      }

      // Validate array items if schema.items is specified
      if (schema.items && data.length > 0) {
        // Check if all items match the schema
        for (let i = 0; i < data.length; i++) {
          if (
            !this.validateOpenAPISchema(
              data[i],
              schema.items,
              errors,
              `${path}[${i}]`,
            )
          ) {
            isValid = false;
          }
        }
      }

      return isValid;
    }

    // Validate primitive types
    const isPrimitiveValid = this.validateProperty(data, schema);
    if (!isPrimitiveValid) {
      const received = typeof data === "string" ? `"${data}"` : data;
      const error = `${path}: Value ${received} does not match schema type ${schema.type}`;
      console.warn(error);
      errors.push(error);
    }
    return isPrimitiveValid;
  }

  /**
   * Validate a property against its schema
   */
  private static validateProperty(value: any, schema: any): boolean {
    // Handle schema with no type (common in referenced schemas)
    if (!schema.type) {
      // If no type is specified but it has properties, assume it's an object
      if (schema.properties) {
        return typeof value === "object" && value !== null;
      }
      // If no type and no properties, we can't validate
      return true;
    }

    // Basic type validation
    switch (schema.type) {
      case "string":
        if (typeof value !== "string") {
          return false;
        }

        // Format validation (if specified)
        if (schema.format) {
          switch (schema.format) {
            case "email":
              return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            case "date-time":
              return !isNaN(Date.parse(value));
            case "uuid":
              return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                value,
              );
            // Add other formats as needed
          }
        }

        // Pattern validation (if specified)
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
          return false;
        }

        // Length validation
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          return false;
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          return false;
        }

        return true;

      case "number":
      case "integer":
        if (typeof value !== "number") {
          return false;
        }

        // Type-specific validation
        if (schema.type === "integer" && !Number.isInteger(value)) {
          return false;
        }

        // Range validation
        if (schema.minimum !== undefined && value < schema.minimum) {
          return false;
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          return false;
        }

        return true;

      case "boolean":
        // Handle boolean values that might be stringified
        if (typeof value === "boolean") return true;
        if (value === "true") return true;
        if (value === "false") return true;
        return false;

      case "object":
        return typeof value === "object" && value !== null;

      case "array":
        return Array.isArray(value);

      case "null":
        return value === null;

      default:
        return true; // Skip validation for unknown types
    }
  }

  /**
   * Validate a response against its expected schema
   */
  static async validateResponse(
    response: Response,
    path: string,
    method: string = "get",
  ): Promise<any> {
    // Make sure we have the full OpenAPI spec
    if (!this.openAPIDoc) {
      await this.fetchOpenAPISpec();
    }

    // Parse the response
    const data = await response.clone().json();

    // Log for debugging
    console.log(
      `Validating ${method.toUpperCase()} ${path} response with status ${response.status}`,
    );

    // Get the schema for this route and status code
    const schema = await this.getRouteSchema(path, method, response.status);

    if (!schema) {
      console.warn(
        `No schema found for ${method.toUpperCase()} ${path} with status ${response.status}`,
      );

      // If no schema, try to find one from OpenAPI spec paths
      const apiPath = this.findOpenAPIPath(path);
      if (apiPath) {
        console.log(`Found matching OpenAPI path: ${apiPath}`);

        const apiMethod = method.toLowerCase();
        const apiOperation = this.openAPIDoc?.paths?.[apiPath]?.[apiMethod];

        if (apiOperation) {
          const responseSchema =
            apiOperation.responses?.[response.status]?.content?.[
              "application/json"
            ]?.schema;

          if (responseSchema) {
            console.log(
              `Found schema in OpenAPI spec for ${method.toUpperCase()} ${path} status ${response.status}`,
            );
            const resolvedResponseSchema = this.resolveSchema(responseSchema);

            if (!this.validateOpenAPISchema(data, resolvedResponseSchema)) {
              throw new Error(
                `Response does not match OpenAPI spec schema for ${method.toUpperCase()} ${path}`,
              );
            }

            return data;
          }
        }
      }
    }

    // If a schema was found from Hono routes, validate against it
    if (schema) {
      console.log(
        `Schema found for ${method.toUpperCase()} ${path} with status ${response.status}`,
      );

      // Print schema type for debugging
      if (typeof schema === "object" && schema !== null) {
        if (typeof (schema as z.ZodType).safeParse === "function") {
          console.log("Schema is a Zod schema");
          // @ts-expect-error
        } else if (schema.$ref) {
          // @ts-expect-error
          console.log(`Schema is a reference: ${schema.$ref}`);
          // @ts-expect-error
        } else if (schema.type) {
          // @ts-expect-error
          console.log(`Schema is an OpenAPI schema of type: ${schema.type}`);
        } else {
          console.log(
            `Schema is an object without type: ${JSON.stringify(schema).substring(0, 100)}...`,
          );
        }
      }

      // Check if it's a Zod schema
      if (
        typeof schema === "object" &&
        schema !== null &&
        typeof (schema as z.ZodType).safeParse === "function"
      ) {
        const result = (schema as z.ZodType).safeParse(data);
        if (!result.success) {
          console.error("Schema validation failed:", result.error);
          throw new Error(
            `Response does not match schema for ${method.toUpperCase()} ${path}: ${result.error.message}`,
          );
        }
        return result.data;
      }

      // If it's an OpenAPI schema
      if (typeof schema === "object" && schema !== null) {
        // Resolve any $ref references in the schema
        const resolvedSchema = this.resolveSchema(schema as OpenAPISchema);

        // Log resolved schema for debugging
        console.log(
          "Resolved schema:",
          JSON.stringify(resolvedSchema).length > 200
            ? JSON.stringify(resolvedSchema).substring(0, 200) + "..."
            : JSON.stringify(resolvedSchema),
        );

        // Validate against resolved schema
        const validationErrors: string[] = [];
        if (
          this.validateOpenAPISchema(data, resolvedSchema, validationErrors)
        ) {
          return data;
        } else {
          console.error("Validation errors:", validationErrors);
          throw new Error(
            `Response does not match OpenAPI schema for ${method.toUpperCase()} ${path}: ${validationErrors.join(", ")}`,
          );
        }
      }
    }

    // If no schema or validation failed, use fallback
    console.warn(
      `Using fallback schema for ${method.toUpperCase()} ${path} with status ${response.status}`,
    );
    const fallbackSchema = this.getFallbackSchema(response.status);
    const result = fallbackSchema.safeParse(data);

    if (!result.success) {
      console.error("Fallback schema validation failed:", result.error);
      throw new Error(
        `Response does not match fallback schema for ${method.toUpperCase()} ${path}: ${result.error.message}`,
      );
    }

    return data;
  }

  /**
   * Find a matching OpenAPI path for the given path
   */
  private static findOpenAPIPath(path: string): string | undefined {
    if (!this.openAPIDoc?.paths) return undefined;

    // Normalize path
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // Try exact match first
    if (this.openAPIDoc.paths[normalizedPath]) {
      return normalizedPath;
    }

    // Try to match path parameters
    const pathParts = normalizedPath.split("/").filter(Boolean);

    for (const apiPath of Object.keys(this.openAPIDoc.paths)) {
      const apiPathParts = apiPath.split("/").filter(Boolean);
      if (pathParts.length !== apiPathParts.length) continue;

      let isMatch = true;
      for (let i = 0; i < pathParts.length; i++) {
        // If API path part is a parameter (starts with {), it matches anything
        if (
          apiPathParts[i]!.startsWith("{") &&
          apiPathParts[i]!.endsWith("}")
        ) {
          continue;
        }

        // Otherwise, parts must match exactly
        if (apiPathParts[i] !== pathParts[i]) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        return apiPath;
      }
    }

    return undefined;
  }

  /**
   * Generate sample data based on a schema type
   */
  static generateSampleData(schema: OpenAPISchema): any {
    // Return early if schema is null or undefined
    if (!schema) {
      return null;
    }

    // Handle schema references
    if (schema.$ref) {
      // Try to resolve the reference
      const resolved = this.resolveSchema(schema);
      if (resolved !== schema) {
        return this.generateSampleData(resolved);
      }
      return null;
    }

    // Handle schemas without a type but with properties
    if (!schema.type && schema.properties) {
      schema = { ...schema, type: "object" };
    }

    // Handle allOf schemas (combine all schemas)
    if (schema.allOf && Array.isArray(schema.allOf)) {
      const result = {};
      for (const subSchema of schema.allOf) {
        Object.assign(result, this.generateSampleData(subSchema));
      }
      return result;
    }

    // Handle oneOf or anyOf schemas (use the first schema)
    if (
      (schema.oneOf || schema.anyOf) &&
      Array.isArray(schema.oneOf || schema.anyOf)
    ) {
      const subSchemas = schema.oneOf || schema.anyOf;
      if (subSchemas!.length > 0) {
        return this.generateSampleData(subSchemas![0]);
      }
    }

    // Generate data based on the schema type
    switch (schema.type) {
      case "object": {
        const result: Record<string, any> = {};

        if (schema.properties) {
          // Include all properties
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            result[key] = this.generateSampleData(propSchema);
          }
        }

        return result;
      }

      case "array": {
        if (schema.items) {
          // Generate a single sample item
          return [this.generateSampleData(schema.items)];
        }
        return [];
      }

      case "string": {
        if (schema.example) {
          return schema.example;
        }

        if (
          schema.enum &&
          Array.isArray(schema.enum) &&
          schema.enum.length > 0
        ) {
          return schema.enum[0];
        }

        if (schema.format) {
          switch (schema.format) {
            case "email":
              return "user@example.com";
            case "date-time":
              return new Date().toISOString();
            case "date":
              return new Date().toISOString().split("T")[0];
            case "uuid":
              return "00000000-0000-0000-0000-000000000000";
            case "uri":
              return "https://example.com";
            case "password":
              return "password123";
          }
        }

        return "sample_string";
      }

      case "number":
      case "integer": {
        if (schema.example !== undefined) {
          return schema.example;
        }

        if (
          schema.enum &&
          Array.isArray(schema.enum) &&
          schema.enum.length > 0
        ) {
          return schema.enum[0];
        }

        if (schema.minimum !== undefined) {
          return schema.minimum;
        }

        return schema.type === "integer" ? 1 : 1.0;
      }

      case "boolean": {
        if (schema.example !== undefined) {
          return schema.example;
        }

        return true;
      }

      case "null":
        return null;

      default:
        return null;
    }
  }

  /**
   * Create an invalid request body by removing a required field
   */
  static async createInvalidRequestBody(
    path: string,
    method: string = "post",
  ): Promise<any> {
    // Make sure we have the full OpenAPI spec
    if (!this.openAPIDoc) {
      await this.fetchOpenAPISpec();
    }

    // Normalize inputs
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const normalizedMethod = method.toLowerCase();

    // Find the matching route
    const route = this.findMatchingRoute(normalizedPath, normalizedMethod);
    if (!route || !route.handler) {
      console.warn(`No route found for ${method.toUpperCase()} ${path}`);
      return null;
    }

    // Get all symbols on the handler
    const symbols = Object.getOwnPropertySymbols(route.handler);

    // Look for the openapi metadata
    for (const sym of symbols) {
      // @ts-expect-error
      const metadata = route.handler[sym];

      if (
        metadata &&
        metadata.resolver &&
        typeof metadata.resolver === "function"
      ) {
        try {
          const result = metadata.resolver({}, {});

          // Handle Promise or direct result
          const resolved = result instanceof Promise ? await result : result;

          if (resolved && resolved.docs) {
            // Look for request body schema in the parsed docs
            if (
              resolved.docs.requestBody?.content?.["application/json"]?.schema
            ) {
              const schema =
                resolved.docs.requestBody.content["application/json"].schema;

              // Resolve any references in the schema
              const resolvedSchema = this.resolveSchema(schema);

              // Generate a valid request body
              const validBody = this.generateSampleData(resolvedSchema);
              console.debug("validBody", validBody);

              // Find a required field to remove
              if (
                resolvedSchema.type === "object" &&
                resolvedSchema.properties &&
                resolvedSchema.required &&
                resolvedSchema.required.length > 0
              ) {
                // Remove first required field to make it invalid
                const fieldToRemove = resolvedSchema.required[0];
                if (fieldToRemove && validBody && fieldToRemove in validBody) {
                  delete validBody[fieldToRemove];
                  return validBody;
                }
              }

              return undefined;
            }
          }
        } catch (error) {
          console.error(
            `Error extracting request body schema for ${normalizedMethod}:${normalizedPath}:`,
            error,
          );
        }
      }
    }

    // If we couldn't extract from handler metadata, check for validator middleware
    // @ts-expect-error - Accessing internal validator structure
    if (route.validators && route.validators.length > 0) {
      // @ts-expect-error - Accessing internal validator structure
      for (const validator of route.validators) {
        // Look for JSON validators
        if (validator && validator.target === "json" && validator.schema) {
          const schema = validator.schema;

          // Generate a valid request body using examples if available
          const validBody = schema.example
            ? typeof schema.example === "function"
              ? schema.example()
              : schema.example
            : this.generateSampleData(schema);

          // Find a required field to remove (for Zod schemas)
          if (schema.shape) {
            const requiredFields = Object.keys(schema.shape).filter((key) => {
              return !schema.shape[key].isOptional?.();
            });

            if (requiredFields.length > 0 && validBody) {
              const fieldToRemove = requiredFields[0]!;
              if (fieldToRemove in validBody) {
                delete validBody[fieldToRemove];
                return validBody;
              }
            }
          }

          return undefined;
        }
      }
    }

    // If no schema was found, try to find one from OpenAPI spec paths
    const apiPath = this.findOpenAPIPath(normalizedPath);
    if (apiPath) {
      const apiOperation =
        this.openAPIDoc?.paths?.[apiPath]?.[normalizedMethod];

      if (
        apiOperation &&
        apiOperation.requestBody?.content?.["application/json"]?.schema
      ) {
        const schema =
          apiOperation.requestBody.content["application/json"].schema;

        // Resolve any references in the schema
        const resolvedSchema = this.resolveSchema(schema);

        // Generate a valid request body
        const validBody = this.generateSampleData(resolvedSchema);

        // Find a required field to remove
        if (
          resolvedSchema.type === "object" &&
          resolvedSchema.properties &&
          resolvedSchema.required &&
          resolvedSchema.required.length > 0
        ) {
          // Remove first required field to make it invalid
          const fieldToRemove = resolvedSchema.required[0];
          if (fieldToRemove && validBody && fieldToRemove in validBody) {
            delete validBody[fieldToRemove];
            return validBody;
          }
        }

        return undefined;
      }
    }

    console.warn(
      `No request body schema found for ${method.toUpperCase()} ${path}`,
    );
    return null;
  }
}
