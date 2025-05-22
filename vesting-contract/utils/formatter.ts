import { Address } from '@ton/core';

export const formatter = {
  address: (address: Address) => {
    return `${address.toString({
      testOnly: false,
      bounceable: true,
      urlSafe: true,
    })}`;
  },
};
