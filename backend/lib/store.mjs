// File purpose:
// Test/local repository backed by a temp-file adapter.

import { dataFile } from "./config.mjs";
import { createTempFileDataAdapter } from "./data/adapters.mjs";
import { createDataRepository } from "./data/repository.mjs";
import { cloneSeedData, seedData } from "./data/seed.mjs";

const repository = createDataRepository(
  createTempFileDataAdapter({
    dataFile,
    seedData: cloneSeedData(),
  }),
);

export { seedData };
export const readData = repository.readData;
export const writeData = repository.writeData;
export const ensureSeedData = repository.ensureSeedData;
export const dataRepository = repository;
