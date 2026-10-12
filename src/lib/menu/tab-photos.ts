/** Whether a category strip shows photo tabs — any category with a photo. */
export function hasTabPhotos<T extends { imageUrl?: string | null }>(categories: T[]): boolean {
  return categories.some((c) => !!c.imageUrl);
}
