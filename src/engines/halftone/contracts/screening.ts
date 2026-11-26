/** Screening methods the contract can name. v1 supports `am` only. */
export type ScreeningMethod = 'am' | 'fm';

export type DotShape = 'round' | 'elliptical' | 'square';

export const DOT_SHAPES: readonly DotShape[] = ['round', 'elliptical', 'square'];

/** Conventional amplitude-modulation parameters for one channel. */
export interface AmScreeningConfiguration {
  readonly method: 'am';
  /** Screen frequency in lines per inch; strictly positive. */
  readonly frequency: number;
  /** Screen angle in degrees from 9 o'clock, clockwise positive. */
  readonly angle: number;
  readonly dotShape: DotShape;
}

/** A method v1 recognises but does not support; rejected during validation. */
export interface UnsupportedScreeningConfiguration {
  readonly method: Exclude<ScreeningMethod, 'am'>;
}

export type ScreeningConfiguration = AmScreeningConfiguration | UnsupportedScreeningConfiguration;
