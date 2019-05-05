import { Model } from './model';
import { Sequelize } from './sequelize';

export class ModelManager {
  public models: Map<string, typeof Model>;
  public all: typeof Model[];

  public addModel<T extends typeof Model>(model: T): T;
  public removeModel(model: typeof Model): void;
  public getModel(against: unknown, options?: { attribute?: string }): typeof Model | undefined;
}

export default ModelManager;
