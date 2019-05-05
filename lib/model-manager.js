'use strict';

const Toposort = require('toposort-class');
const _ = require('lodash');

class ModelManager {
  constructor() {
    this.models = new Map();
  }

  addModel(model) {
    this.models.set(model.name, model);
    return model;
  }

  removeModel(modelToRemove) {
    this.models.delete(modelToRemove.name);
  }

  getModel(against, { attribute = 'name' } = {}) {
    if (attribute !== 'name') {
      for (const model of this.models.entries()) {
        if (model[attribute] === against) {
          return model;
        }
      }
      return undefined;
    }
    return this.models.get(against);
  }

  get all() {
    return Array.from(this.models.values());
  }

  /**
   * Iterate over Models in an order suitable for e.g. creating tables.
   * Will take foreign key constraints into account so that dependencies are visited before dependents.
   *
   * @param {Function} iterator method to execute on each model
   * @param {Object} [options] iterator options
   * @private
   */
  forEachModel(iterator, options) {
    const models = {};
    const sorter = new Toposort();
    let sorted;
    let dep;

    options = {
      reverse: true,
      ...options
    };

    for (const model of this.models.values()) {
      let deps = [];
      let tableName = model.getTableName();

      if (_.isObject(tableName)) {
        tableName = `${tableName.schema}.${tableName.tableName}`;
      }

      models[tableName] = model;

      for (const attrName in model.rawAttributes) {
        if (model.rawAttributes.hasOwnProperty(attrName)) {
          const attribute = model.rawAttributes[attrName];

          if (attribute.references) {
            dep = attribute.references.model;

            if (_.isObject(dep)) {
              dep = `${dep.schema}.${dep.tableName}`;
            }

            deps.push(dep);
          }
        }
      }

      deps = deps.filter(dep => tableName !== dep);

      sorter.add(tableName, deps);
    }

    sorted = sorter.sort();
    if (options.reverse) {
      sorted = sorted.reverse();
    }
    for (const name of sorted) {
      iterator(models[name], name);
    }
  }
}

module.exports = ModelManager;
module.exports.ModelManager = ModelManager;
module.exports.default = ModelManager;
