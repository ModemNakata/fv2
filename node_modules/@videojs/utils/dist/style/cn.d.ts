//#region src/style/cn.d.ts
type ClassPrimitive = string | Record<string, unknown> | undefined;
type ClassValue = ClassPrimitive | readonly string[] | readonly ClassPrimitive[];
/**
 * A (very basic) utility to merge class names and make them a little easier to read.
 * Aims to replicate the API of popular libraries like `clsx` and `classnames` but with a much simpler implementation.
 * This is not intended to be a full replacement for those libraries, but it should be sufficient for our use case.
 * It also allows us to avoid adding an additional dependency to our packages.
 *
 * @example
 * ```ts
 * cn('foo', { bar: true, baz: false }, 'qux');
 * // => 'foo bar qux'
 * ```
 */
declare function cn(...classes: ClassValue[]): string;
//#endregion
export { cn };
//# sourceMappingURL=cn.d.ts.map