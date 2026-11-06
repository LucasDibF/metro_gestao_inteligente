/** Any value JSON can carry. Object members may be absent, as in the database JSON columns. */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue | undefined };
export type JsonArray = JsonValue[];

/**
 * The JSON form of a server-side value, as JSON.stringify sends it: dates and decimals become
 * the strings their toJSON returns, members that may be undefined become optional, and functions
 * disappear. Values that are already JSON keep their type.
 */
export type Jsonified<T> = T extends string | number | boolean | null
  ? T
  : T extends undefined | symbol | ((...args: never[]) => unknown)
    ? never
    : T extends JsonValue
      ? T
      : T extends { toJSON(): infer Serialized }
        ? Jsonified<Serialized>
        : T extends ReadonlyArray<infer Item>
          ? Jsonified<Item>[]
          : JsonifiedObject<T>;

type JsonifiedObject<T> = {
  [Key in keyof T as undefined extends T[Key] ? never : Key]: Jsonified<T[Key]>;
} & {
  [Key in keyof T as undefined extends T[Key] ? Key : never]?: Jsonified<T[Key]>;
};
