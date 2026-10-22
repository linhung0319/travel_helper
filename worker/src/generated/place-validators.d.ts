// scripts/build-validators.mjs 產生的驗證程式的型別
export interface ValidationError {
  instancePath: string;
  keyword: string;
  message?: string;
  params: Record<string, unknown>;
}
export interface PlaceValidator {
  (data: unknown): boolean;
  errors?: ValidationError[] | null;
}
export const station: PlaceValidator;
export const spot: PlaceValidator;
export const lodging: PlaceValidator;
export const restaurant: PlaceValidator;
