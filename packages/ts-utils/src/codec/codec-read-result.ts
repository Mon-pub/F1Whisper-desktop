/**
 * Read result for a read operation on a codec reader.
 */
export type CodecReadResult<I> = Readonly<
    | {
          done: false;
          value: I;
      }
    | {
          done: true;
          value: undefined;
      }
>;
