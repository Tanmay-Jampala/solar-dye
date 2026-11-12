/** Give the main thread back to the browser between chunks of setup work, so no single task runs
 *  long enough to block input (Lighthouse "total blocking time"). */
export const yieldToMain = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
