'use strict';

const { Association } = require('./base');

exports.BelongsTo = require('./belongs-to').BelongsTo;
exports.HasOne = require('./has-one').HasOne;
exports.HasMany = require('./has-many').HasMany;
exports.BelongsToMany = require('./belongs-to-many').BelongsToMany;

exports.Association = Association;
