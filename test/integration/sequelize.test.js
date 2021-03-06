'use strict';

const { expect, assert } = require('chai');
const Support = require('./support');
const DataTypes = require('../../lib/data-types');
const dialect = Support.getTestDialect();
const _ = require('lodash');
const Sequelize = require('../../index');
const config = require('../config/config');
const moment = require('moment');
const Transaction = require('../../lib/transaction');
const sinon = require('sinon');
const current = Support.sequelize;

const qq = str => {
  if (dialect === 'postgres' || dialect === 'mssql') {
    return `"${str}"`;
  }
  if (dialect === 'mysql' || dialect === 'mariadb' || dialect === 'sqlite') {
    return `\`${str}\``;
  }
  return str;
};

describe(Support.getTestDialectTeaser('Sequelize'), () => {
  describe('constructor', () => {
    it('should pass the global options correctly', () => {
      const sequelize = Support.createSequelizeInstance({ logging: false, define: { underscored: true } }),
        DAO = sequelize.define('dao', { name: DataTypes.STRING });

      expect(DAO.options.underscored).to.be.ok;
    });

    it('should correctly set the host and the port', () => {
      const sequelize = Support.createSequelizeInstance({ host: '127.0.0.1', port: 1234 });
      expect(sequelize.config.port).to.equal(1234);
      expect(sequelize.config.host).to.equal('127.0.0.1');
    });

    it('should set operators aliases on dialect queryGenerator', () => {
      const operatorsAliases = { fake: true };
      const sequelize = Support.createSequelizeInstance({ operatorsAliases });

      expect(sequelize).to.have.property('dialect');
      expect(sequelize.dialect).to.have.property('queryGenerator');
      expect(sequelize.dialect.queryGenerator).to.have.property('OperatorsAliasMap');
      expect(sequelize.dialect.queryGenerator.OperatorsAliasMap).to.be.eql(operatorsAliases);
    });

    if (dialect === 'sqlite') {
      it('should work with connection strings (1)', () => {
        new Sequelize('sqlite://test.sqlite');
      });
      it('should work with connection strings (2)', () => {
        new Sequelize('sqlite://test.sqlite/');
      });
      it('should work with connection strings (3)', () => {
        new Sequelize('sqlite://test.sqlite/lol?reconnect=true');
      });
    }

    if (dialect === 'postgres') {
      const getConnectionUri = o => `${o.protocol}://${o.username}:${o.password}@${o.host}${o.port ? `:${o.port}` : ''}/${o.database}`;
      it('should work with connection strings (postgres protocol)', () => {
        const connectionUri = getConnectionUri({ ...config[dialect], protocol: 'postgres' });
        // postgres://...
        new Sequelize(connectionUri);
      });
      it('should work with connection strings (postgresql protocol)', () => {
        const connectionUri = getConnectionUri({ ...config[dialect], protocol: 'postgresql' });
        // postgresql://...
        new Sequelize(connectionUri);
      });
    }
  });

  if (dialect !== 'sqlite') {
    describe('authenticate', () => {
      describe('with valid credentials', () => {
        it('triggers the success event', async function() {
          await this.sequelize.authenticate();
        });
      });

      describe('with an invalid connection', () => {
        beforeEach(function() {
          const options = { ...this.sequelize.options, port: '99999' };
          this.sequelizeWithInvalidConnection = new Sequelize('wat', 'trololo', 'wow', options);
        });

        it('triggers the error event', async function() {
          try {
            await this
              .sequelizeWithInvalidConnection
              .authenticate();
          } catch (err) {
            expect(err).to.not.be.null;
          }
        });

        it('triggers an actual RangeError or ConnectionError', async function() {
          try {
            await this
              .sequelizeWithInvalidConnection
              .authenticate();
          } catch (err) {
            expect(
              err instanceof RangeError ||
              err instanceof Sequelize.ConnectionError
            ).to.be.ok;
          }
        });

        it('triggers the actual adapter error', async function() {
          try {
            await this
              .sequelizeWithInvalidConnection
              .authenticate();
          } catch (err) {
            console.log(err);
            expect(
              err.message.includes('connect ECONNREFUSED') ||
              err.message.includes('invalid port number') ||
              err.message.match(/should be >=? 0 and < 65536/) ||
              err.message.includes('Login failed for user') ||
              err.message.includes('must be > 0 and < 65536')
            ).to.be.ok;
          }
        });
      });

      describe('with invalid credentials', () => {
        beforeEach(function() {
          this.sequelizeWithInvalidCredentials = new Sequelize('localhost', 'wtf', 'lol', this.sequelize.options);
        });

        it('triggers the error event', async function() {
          try {
            await this
              .sequelizeWithInvalidCredentials
              .authenticate();
          } catch (err) {
            expect(err).to.not.be.null;
          }
        });

        it('triggers an actual sequlize error', async function() {
          try {
            await this
              .sequelizeWithInvalidCredentials
              .authenticate();
          } catch (err) {
            expect(err).to.be.instanceof(Sequelize.Error);
          }
        });

        it('triggers the error event when using replication', async () => {
          try {
            await new Sequelize('sequelize', null, null, {
              dialect,
              replication: {
                read: {
                  host: 'localhost',
                  username: 'omg',
                  password: 'lol'
                }
              }
            }).authenticate();
          } catch (err) {
            expect(err).to.not.be.null;
          }
        });
      });
    });

    describe('validate', () => {
      it('is an alias for .authenticate()', function() {
        expect(this.sequelize.validate).to.equal(this.sequelize.authenticate);
      });
    });
  }

  describe('getDialect', () => {
    it('returns the defined dialect', function() {
      expect(this.sequelize.getDialect()).to.equal(dialect);
    });
  });

  describe('getDatabaseName', () => {
    it('returns the database name', function() {
      expect(this.sequelize.getDatabaseName()).to.equal(this.sequelize.config.database);
    });
  });

  describe('isDefined', () => {
    it('returns false if the dao wasn\'t defined before', function() {
      expect(this.sequelize.isDefined('Project')).to.be.false;
    });

    it('returns true if the dao was defined before', function() {
      this.sequelize.define('Project', {
        name: DataTypes.STRING
      });
      expect(this.sequelize.isDefined('Project')).to.be.true;
    });
  });

  describe('model', () => {
    it('throws an error if the dao being accessed is undefined', function() {
      expect(() => {
        this.sequelize.model('Project');
      }).to.throw(/project has not been defined/i);
    });

    it('returns the dao factory defined by daoName', function() {
      const project = this.sequelize.define('Project', {
        name: DataTypes.STRING
      });

      expect(this.sequelize.model('Project')).to.equal(project);
    });
  });

  describe('query', () => {
    afterEach(function() {
      this.sequelize.options.quoteIdentifiers = true;
      console.log.restore && console.log.restore();
    });

    beforeEach(async function() {
      this.User = this.sequelize.define('User', {
        username: {
          type: DataTypes.STRING,
          unique: true
        },
        emailAddress: {
          type: DataTypes.STRING,
          field: 'email_address'
        }
      });

      this.insertQuery = `INSERT INTO ${qq(this.User.tableName)} (username, email_address, ${
        qq('createdAt')  }, ${qq('updatedAt')
      }) VALUES ('john', 'john@gmail.com', '2012-01-01 10:10:10', '2012-01-01 10:10:10')`;

      await this.User.sync({ force: true });
    });

    it('executes a query the internal way', async function() {
      await this.sequelize.query(this.insertQuery, { raw: true });
    });

    it('executes a query if only the sql is passed', async function() {
      await this.sequelize.query(this.insertQuery);
    });

    it('executes a query if a placeholder value is an array', async function() {
      await this.sequelize.query(`INSERT INTO ${qq(this.User.tableName)} (username, email_address, ` +
        `${qq('createdAt')}, ${qq('updatedAt')}) VALUES ?;`, {
        replacements: [[
          ['john', 'john@gmail.com', '2012-01-01 10:10:10', '2012-01-01 10:10:10'],
          ['michael', 'michael@gmail.com', '2012-01-01 10:10:10', '2012-01-01 10:10:10']
        ]]
      });

      const rows = await this.sequelize.query(`SELECT * FROM ${qq(this.User.tableName)};`, {
        type: this.sequelize.QueryTypes.SELECT
      });

      expect(rows).to.be.lengthOf(2);
      expect(rows[0].username).to.be.equal('john');
      expect(rows[1].username).to.be.equal('michael');
    });

    describe('retry',  () => {
      it('properly bind parameters on extra retries', async function() {
        const payload = {
          username: 'test',
          createdAt: '2010-10-10 00:00:00',
          updatedAt: '2010-10-10 00:00:00'
        };

        const spy = sinon.spy();

        await this.User.create(payload);

        await expect(this.sequelize.query(`
          INSERT INTO ${qq(this.User.tableName)} (username,${qq('createdAt')},${qq('updatedAt')}) VALUES ($username,$createdAt,$updatedAt);
        `, {
          bind: payload,
          logging: spy,
          retry: {
            max: 3,
            match: [
              /Validation/
            ]
          }
        })).to.be.rejectedWith(Sequelize.UniqueConstraintError);

        expect(spy.callCount).to.eql(3);
      });
    });

    describe('logging', () => {
      it('executes a query with global benchmarking option and custom logger', async () => {
        const logger = sinon.spy();
        const sequelize = Support.createSequelizeInstance({
          logging: logger,
          benchmark: true
        });

        await sequelize.query('select 1;');
        expect(logger.calledOnce).to.be.true;
        expect(logger.args[0][0]).to.be.match(/Executed \((\d*|default)\): select 1/);
        expect(typeof logger.args[0][1] === 'number').to.be.true;
      });

      it('executes a query with benchmarking option and custom logger', async function() {
        const logger = sinon.spy();

        await this.sequelize.query('select 1;', {
          logging: logger,
          benchmark: true
        });

        expect(logger.calledOnce).to.be.true;
        expect(logger.args[0][0]).to.be.match(/Executed \(\d*|default\): select 1;/);
        expect(typeof logger.args[0][1] === 'number').to.be.true;
      });
      describe('log sql when set logQueryParameters', () => {
        beforeEach(async function() {
          this.sequelize = Support.createSequelizeInstance({
            benchmark: true,
            logQueryParameters: true
          });
          this.User = this.sequelize.define('User', {
            id: {
              type: DataTypes.INTEGER,
              primaryKey: true,
              autoIncrement: true
            },
            username: {
              type: DataTypes.STRING
            },
            emailAddress: {
              type: DataTypes.STRING
            }
          }, {
            timestamps: false
          });

          await this.User.sync({ force: true });
        });
        it('add parameters in log sql', async function() {
          let createSql, updateSql;

          const user = await this.User.create({
            username: 'john',
            emailAddress: 'john@gmail.com'
          }, {
            logging: s =>{
              createSql = s;
            }
          });

          user.username = 'li';

          await user.save({
            logging: s =>{
              updateSql = s;
            }
          });

          expect(createSql).to.match(/; ("john", "john@gmail.com"|{"(\$1|0)":"john","(\$2|1)":"john@gmail.com"})/);
          expect(updateSql).to.match(/; ("li", 1|{"(\$1|0)":"li","(\$2|1)":1})/);
        });

        it('add parameters in log sql when use bind value', async function() {
          let logSql;
          const typeCast = dialect === 'postgres' ? '::text' : '';
          await this.sequelize.query(`select $1${typeCast} as foo, $2${typeCast} as bar`, { bind: ['foo', 'bar'], logging: s=>logSql = s });
          expect(logSql).to.match(/; ("foo", "bar"|{"(\$1|0)":"foo","(\$2|1)":"bar"})/);
        });
      });

    });

    it('executes select queries correctly', async function() {
      await this.sequelize.query(this.insertQuery);
      const [users] = await this.sequelize.query(`select * from ${qq(this.User.tableName)}`);
      expect(users.map(u => { return u.username; })).to.include('john');
    });

    it('executes select queries correctly when quoteIdentifiers is false', async function() {
      const seq = Object.create(this.sequelize);

      seq.options.quoteIdentifiers = false;
      await seq.query(this.insertQuery);
      const [users] = await seq.query(`select * from ${qq(this.User.tableName)}`);
      expect(users.map(u => { return u.username; })).to.include('john');
    });

    it('executes select query with dot notation results', async function() {
      await this.sequelize.query(`DELETE FROM ${qq(this.User.tableName)}`);
      await this.sequelize.query(this.insertQuery);
      const [users] = await this.sequelize.query(`select username as ${qq('user.username')} from ${qq(this.User.tableName)}`);
      expect(users).to.deep.equal([{ 'user.username': 'john' }]);
    });

    it('executes select query with dot notation results and nest it', async function() {
      await this.sequelize.query(`DELETE FROM ${qq(this.User.tableName)}`);
      await this.sequelize.query(this.insertQuery);
      const users = await this.sequelize.query(`select username as ${qq('user.username')} from ${qq(this.User.tableName)}`, { raw: true, nest: true });
      expect(users.map(u => { return u.user; })).to.deep.equal([{ 'username': 'john' }]);
    });

    if (dialect === 'mysql') {
      it('executes stored procedures', async function() {
        await this.sequelize.query(this.insertQuery);
        await this.sequelize.query('DROP PROCEDURE IF EXISTS foo');

        await this.sequelize.query(
          `CREATE PROCEDURE foo()\nSELECT * FROM ${this.User.tableName};`
        );

        const users = await this.sequelize.query('CALL foo()');
        expect(users.map(u => { return u.username; })).to.include('john');
      });
    } else {
      console.log('FIXME: I want to be supported in this dialect as well :-(');
    }

    it('uses the passed model', async function() {
      await this.sequelize.query(this.insertQuery);

      const users = await this.sequelize.query(`SELECT * FROM ${qq(this.User.tableName)};`, {
        model: this.User
      });

      expect(users[0]).to.be.instanceof(this.User);
    });

    it('maps the field names to attributes based on the passed model', async function() {
      await this.sequelize.query(this.insertQuery);

      const users = await this.sequelize.query(`SELECT * FROM ${qq(this.User.tableName)};`, {
        model: this.User,
        mapToModel: true
      });

      expect(users[0].emailAddress).to.be.equal('john@gmail.com');
    });

    it('arbitrarily map the field names', async function() {
      await this.sequelize.query(this.insertQuery);

      const users = await this.sequelize.query(`SELECT * FROM ${qq(this.User.tableName)};`, {
        type: 'SELECT',
        fieldMap: { username: 'userName', email_address: 'email' }
      });

      expect(users[0].userName).to.be.equal('john');
      expect(users[0].email).to.be.equal('john@gmail.com');
    });

    it('keeps field names that are mapped to the same name', async function() {
      await this.sequelize.query(this.insertQuery);

      const users = await this.sequelize.query(`SELECT * FROM ${qq(this.User.tableName)};`, {
        type: 'SELECT',
        fieldMap: { username: 'username', email_address: 'email' }
      });

      expect(users[0].username).to.be.equal('john');
      expect(users[0].email).to.be.equal('john@gmail.com');
    });

    it('reject if `values` and `options.replacements` are both passed', async function() {
      await this.sequelize.query({ query: 'select ? as foo, ? as bar', values: [1, 2] }, { raw: true, replacements: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `sql.values` and `options.replacements` cannot be set at the same time');
    });

    it('reject if `sql.bind` and `options.bind` are both passed', async function() {
      await this.sequelize.query({ query: 'select $1 + ? as foo, $2 + ? as bar', bind: [1, 2] }, { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `sql.bind` and `options.bind` cannot be set at the same time');
    });

    it('reject if `options.replacements` and `options.bind` are both passed', async function() {
      await this.sequelize.query('select $1 + ? as foo, $2 + ? as bar', { raw: true, bind: [1, 2], replacements: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('reject if `sql.bind` and `sql.values` are both passed', async function() {
      await this.sequelize.query({ query: 'select $1 + ? as foo, $2 + ? as bar', bind: [1, 2], values: [1, 2] }, { raw: true })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('reject if `sql.bind` and `options.replacements`` are both passed', async function() {
      await this.sequelize.query({ query: 'select $1 + ? as foo, $2 + ? as bar', bind: [1, 2] }, { raw: true, replacements: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('reject if `options.bind` and `sql.replacements` are both passed', async function() {
      await this.sequelize.query({ query: 'select $1 + ? as foo, $1 _ ? as bar', values: [1, 2] }, { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('properly adds and escapes replacement value', async function() {
      let logSql;
      const number  = 1,
        date = new Date(),
        string = 't\'e"st',
        boolean = true,
        buffer = Buffer.from('t\'e"st');

      date.setMilliseconds(0);

      const result = await this.sequelize.query({
        query: 'select ? as number, ? as date,? as string,? as boolean,? as buffer',
        values: [number, date, string, boolean, buffer]
      }, {
        type: this.sequelize.QueryTypes.SELECT,
        logging(s) {
          logSql = s;
        }
      });

      const res = result[0] || {};
      res.date = res.date && new Date(res.date);
      res.boolean = res.boolean && true;
      if (typeof res.buffer === 'string' && res.buffer.startsWith('\\x')) {
        res.buffer = Buffer.from(res.buffer.substring(2), 'hex');
      }
      expect(res).to.deep.equal({
        number,
        date,
        string,
        boolean,
        buffer
      });
      expect(logSql).to.not.include('?');
    });

    it('it allows to pass custom class instances', async function() {
      let logSql;
      class SQLStatement {
        constructor() {
          this.values = [1, 2];
        }
        get query() {
          return 'select ? as foo, ? as bar';
        }
      }
      const result = await this.sequelize.query(new SQLStatement(), { type: this.sequelize.QueryTypes.SELECT, logging: s => logSql = s } );
      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      expect(logSql).to.not.include('?');
    });

    it('uses properties `query` and `values` if query is tagged', async function() {
      let logSql;
      const result = await this.sequelize.query({ query: 'select ? as foo, ? as bar', values: [1, 2] }, { type: this.sequelize.QueryTypes.SELECT, logging(s) { logSql = s; } });
      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      expect(logSql).to.not.include('?');
    });

    it('uses properties `query` and `bind` if query is tagged', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      let logSql;
      const result = await this.sequelize.query({ query: `select $1${typeCast} as foo, $2${typeCast} as bar`, bind: [1, 2] }, { type: this.sequelize.QueryTypes.SELECT, logging(s) { logSql = s; } });
      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      if (dialect === 'postgres' || dialect === 'sqlite') {
        expect(logSql).to.include('$1');
        expect(logSql).to.include('$2');
      } else if (dialect === 'mssql') {
        expect(logSql).to.include('@0');
        expect(logSql).to.include('@1');
      } else if (dialect === 'mysql') {
        expect(logSql.match(/\?/g).length).to.equal(2);
      }
    });

    it('dot separated attributes when doing a raw query without nest', async function() {
      const tickChar = dialect === 'postgres' || dialect === 'mssql' ? '"' : '`',
        sql = `select 1 as ${Sequelize.Utils.addTicks('foo.bar.baz', tickChar)}`;

      await expect(this.sequelize.query(sql, { raw: true, nest: false }).then(obj => obj[0])).to.eventually.deep.equal([{ 'foo.bar.baz': 1 }]);
    });

    it('destructs dot separated attributes when doing a raw query using nest', async function() {
      const tickChar = dialect === 'postgres' || dialect === 'mssql' ? '"' : '`',
        sql = `select 1 as ${Sequelize.Utils.addTicks('foo.bar.baz', tickChar)}`;

      const result = await this.sequelize.query(sql, { raw: true, nest: true });
      expect(result).to.deep.equal([{ foo: { bar: { baz: 1 } } }]);
    });

    it('replaces token with the passed array', async function() {
      const result = await this.sequelize.query('select ? as foo, ? as bar', { type: this.sequelize.QueryTypes.SELECT, replacements: [1, 2] });
      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
    });

    it('replaces named parameters with the passed object', async function() {
      await expect(this.sequelize.query('select :one as foo, :two as bar', { raw: true, replacements: { one: 1, two: 2 } }).then(obj => obj[0]))
        .to.eventually.deep.equal([{ foo: 1, bar: 2 }]);
    });

    it('replaces named parameters with the passed object and ignore those which does not qualify', async function() {
      await expect(this.sequelize.query('select :one as foo, :two as bar, \'00:00\' as baz', { raw: true, replacements: { one: 1, two: 2 } }).then(obj => obj[0]))
        .to.eventually.deep.equal([{ foo: 1, bar: 2, baz: '00:00' }]);
    });

    it('replaces named parameters with the passed object using the same key twice', async function() {
      await expect(this.sequelize.query('select :one as foo, :two as bar, :one as baz', { raw: true, replacements: { one: 1, two: 2 } }).then(obj => obj[0]))
        .to.eventually.deep.equal([{ foo: 1, bar: 2, baz: 1 }]);
    });

    it('replaces named parameters with the passed object having a null property', async function() {
      await expect(this.sequelize.query('select :one as foo, :two as bar', { raw: true, replacements: { one: 1, two: null } }).then(obj => obj[0]))
        .to.eventually.deep.equal([{ foo: 1, bar: null }]);
    });

    it('reject when key is missing in the passed object', async function() {
      await this.sequelize.query('select :one as foo, :two as bar, :three as baz', { raw: true, replacements: { one: 1, two: 2 } })
        .should.be.rejectedWith(Error, /Named parameter ":\w+" has no value in the given object\./g);
    });

    it('reject with the passed number', async function() {
      await this.sequelize.query('select :one as foo, :two as bar', { raw: true, replacements: 2 })
        .should.be.rejectedWith(Error, /Named parameter ":\w+" has no value in the given object\./g);
    });

    it('reject with the passed empty object', async function() {
      await this.sequelize.query('select :one as foo, :two as bar', { raw: true, replacements: {} })
        .should.be.rejectedWith(Error, /Named parameter ":\w+" has no value in the given object\./g);
    });

    it('reject with the passed string', async function() {
      await this.sequelize.query('select :one as foo, :two as bar', { raw: true, replacements: 'foobar' })
        .should.be.rejectedWith(Error, /Named parameter ":\w+" has no value in the given object\./g);
    });

    it('reject with the passed date', async function() {
      await this.sequelize.query('select :one as foo, :two as bar', { raw: true, replacements: new Date() })
        .should.be.rejectedWith(Error, /Named parameter ":\w+" has no value in the given object\./g);
    });

    it('binds token with the passed array', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      let logSql;
      const result = await this.sequelize.query(`select $1${typeCast} as foo, $2${typeCast} as bar`, { type: this.sequelize.QueryTypes.SELECT, bind: [1, 2], logging(s) { logSql = s;} });
      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      if (dialect === 'postgres' || dialect === 'sqlite') {
        expect(logSql).to.include('$1');
      }
    });

    it('binds named parameters with the passed object', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      let logSql;
      const result = await this.sequelize.query(`select $one${typeCast} as foo, $two${typeCast} as bar`, { raw: true, bind: { one: 1, two: 2 }, logging(s) { logSql = s; } });
      expect(result[0]).to.deep.equal([{ foo: 1, bar: 2 }]);
      if (dialect === 'postgres') {
        expect(logSql).to.include('$1');
      }
      if (dialect === 'sqlite') {
        expect(logSql).to.include('$one');
      }
    });

    it('binds named parameters with the passed object using the same key twice', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      let logSql;
      const result = await this.sequelize.query(`select $one${typeCast} as foo, $two${typeCast} as bar, $one${typeCast} as baz`, { raw: true, bind: { one: 1, two: 2 }, logging(s) { logSql = s; } });
      expect(result[0]).to.deep.equal([{ foo: 1, bar: 2, baz: 1 }]);
      if (dialect === 'postgres') {
        expect(logSql).to.include('$1');
        expect(logSql).to.include('$2');
        expect(logSql).to.not.include('$3');
      }
    });

    it('binds named parameters with the passed object having a null property', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      const result = await this.sequelize.query(`select $one${typeCast} as foo, $two${typeCast} as bar`, { raw: true, bind: { one: 1, two: null } });
      expect(result[0]).to.deep.equal([{ foo: 1, bar: null }]);
    });

    it('binds named parameters array handles escaped $$', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      let logSql;
      const result = await this.sequelize.query(`select $1${typeCast} as foo, '$$ / $$1' as bar`, { raw: true, bind: [1], logging(s) { logSql = s;} });
      expect(result[0]).to.deep.equal([{ foo: 1, bar: '$ / $1' }]);
      if (dialect === 'postgres' || dialect === 'sqlite') {
        expect(logSql).to.include('$1');
      }
    });

    it('binds named parameters object handles escaped $$', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      const result = await this.sequelize.query(`select $one${typeCast} as foo, '$$ / $$one' as bar`, { raw: true, bind: { one: 1 } });
      expect(result[0]).to.deep.equal([{ foo: 1, bar: '$ / $one' }]);
    });

    it('escape where has $ on the middle of characters', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';
      const result = await this.sequelize.query(`select $one${typeCast} as foo$bar`, { raw: true, bind: { one: 1 } });
      expect(result[0]).to.deep.equal([{ foo$bar: 1 }]);
    });

    if (dialect === 'postgres' || dialect === 'sqlite' || dialect === 'mssql') {
      it('does not improperly escape arrays of strings bound to named parameters', async function() {
        const result = await this.sequelize.query('select :stringArray as foo', { raw: true, replacements: { stringArray: ['"string"'] } });
        expect(result[0]).to.deep.equal([{ foo: '"string"' }]);
      });
    }

    it('reject when binds passed with object and numeric $1 is also present', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';

      await this.sequelize.query(`select $one${typeCast} as foo, $two${typeCast} as bar, '$1' as baz`, {  raw: true, bind: { one: 1, two: 2 } })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when binds passed as array and $alpha is also present', async function() {
      const typeCast = dialect === 'postgres' ? '::int' : '';

      await this.sequelize.query(`select $1${typeCast} as foo, $2${typeCast} as bar, '$foo' as baz`, { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is $0 with the passed array', async function() {
      await this.sequelize.query('select $1 as foo, $0 as bar, $3 as baz', { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is $01 with the passed array', async function() {
      await this.sequelize.query('select $1 as foo, $01 as bar, $3 as baz', { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is missing in the passed array', async function() {
      await this.sequelize.query('select $1 as foo, $2 as bar, $3 as baz', { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is missing in the passed object', async function() {
      await this.sequelize.query('select $one as foo, $two as bar, $three as baz', { raw: true, bind: { one: 1, two: 2 } })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed number for bind', async function() {
      await this.sequelize.query('select $one as foo, $two as bar', { raw: true, bind: 2 })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed empty object for bind', async function() {
      await this.sequelize.query('select $one as foo, $two as bar', { raw: true, bind: {} })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed string for bind', async function() {
      await this.sequelize.query('select $one as foo, $two as bar', { raw: true, bind: 'foobar' })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed date for bind', async function() {
      await this.sequelize.query('select $one as foo, $two as bar', { raw: true, bind: new Date() })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('handles AS in conjunction with functions just fine', async function() {
      let datetime = dialect === 'sqlite' ? 'date(\'now\')' : 'NOW()';
      if (dialect === 'mssql') {
        datetime = 'GETDATE()';
      }

      const [result] = await this.sequelize.query(`SELECT ${datetime} AS t`);
      expect(moment(result[0].t).isValid()).to.be.true;
    });

    if (Support.getTestDialect() === 'postgres') {
      it('replaces named parameters with the passed object and ignores casts', async function() {
        await expect(this.sequelize.query('select :one as foo, :two as bar, \'1000\'::integer as baz', { raw: true, replacements: { one: 1, two: 2 } }).then(obj => obj[0]))
          .to.eventually.deep.equal([{ foo: 1, bar: 2, baz: 1000 }]);
      });

      it('supports WITH queries', async function() {
        await expect(this.sequelize.query('WITH RECURSIVE t(n) AS ( VALUES (1) UNION ALL SELECT n+1 FROM t WHERE n < 100) SELECT sum(n) FROM t').then(obj => obj[0]))
          .to.eventually.deep.equal([{ 'sum': '5050' }]);
      });
    }

    if (Support.getTestDialect() === 'sqlite') {
      it('binds array parameters for upsert are replaced. $$ unescapes only once', async function() {
        let logSql;
        await this.sequelize.query('select $1 as foo, $2 as bar, \'$$$$\' as baz', { type: this.sequelize.QueryTypes.UPSERT, bind: [1, 2], logging(s) { logSql = s; } });
        // sqlite.exec does not return a result
        expect(logSql).to.not.include('$one');
        expect(logSql).to.include('\'$$\'');
      });

      it('binds named parameters for upsert are replaced. $$ unescapes only once', async function() {
        let logSql;
        await this.sequelize.query('select $one as foo, $two as bar, \'$$$$\' as baz', { type: this.sequelize.QueryTypes.UPSERT, bind: { one: 1, two: 2 }, logging(s) { logSql = s; } });
        // sqlite.exec does not return a result
        expect(logSql).to.not.include('$one');
        expect(logSql).to.include('\'$$\'');
      });
    }

  });

  describe('set', () => {
    it('should be configurable with global functions', function() {
      const defaultSetterMethod = sinon.spy(),
        overrideSetterMethod = sinon.spy(),
        defaultGetterMethod = sinon.spy(),
        overrideGetterMethod = sinon.spy(),
        customSetterMethod = sinon.spy(),
        customOverrideSetterMethod = sinon.spy(),
        customGetterMethod = sinon.spy(),
        customOverrideGetterMethod = sinon.spy();

      this.sequelize.options.define = {
        'setterMethods': {
          'default': defaultSetterMethod,
          'override': overrideSetterMethod
        },
        'getterMethods': {
          'default': defaultGetterMethod,
          'override': overrideGetterMethod
        }
      };
      const testEntity = this.sequelize.define('TestEntity', {}, {
        'setterMethods': {
          'custom': customSetterMethod,
          'override': customOverrideSetterMethod
        },
        'getterMethods': {
          'custom': customGetterMethod,
          'override': customOverrideGetterMethod
        }
      });

      // Create Instance to test
      const instance = testEntity.build();

      // Call Getters
      instance.default;
      instance.custom;
      instance.override;

      expect(defaultGetterMethod).to.have.been.calledOnce;
      expect(customGetterMethod).to.have.been.calledOnce;
      expect(overrideGetterMethod.callCount).to.be.eql(0);
      expect(customOverrideGetterMethod).to.have.been.calledOnce;

      // Call Setters
      instance.default = 'test';
      instance.custom = 'test';
      instance.override = 'test';

      expect(defaultSetterMethod).to.have.been.calledOnce;
      expect(customSetterMethod).to.have.been.calledOnce;
      expect(overrideSetterMethod.callCount).to.be.eql(0);
      expect(customOverrideSetterMethod).to.have.been.calledOnce;
    });
  });

  if (dialect === 'mysql') {
    describe('set', () => {
      it("should return an promised error if transaction isn't defined", async function() {
        await expect(this.sequelize.set({ foo: 'bar' }))
          .to.be.rejectedWith(TypeError, 'options.transaction is required');
      });

      it('one value', async function() {
        const t = await this.sequelize.transaction();
        this.t = t;
        await this.sequelize.set({ foo: 'bar' }, { transaction: t });
        const data = await this.sequelize.query('SELECT @foo as `foo`', { plain: true, transaction: this.t });
        expect(data).to.be.ok;
        expect(data.foo).to.be.equal('bar');
        await this.t.commit();
      });

      it('multiple values', async function() {
        const t = await this.sequelize.transaction();
        this.t = t;

        await this.sequelize.set({
          foo: 'bar',
          foos: 'bars'
        }, { transaction: t });

        const data = await this.sequelize.query('SELECT @foo as `foo`, @foos as `foos`', { plain: true, transaction: this.t });
        expect(data).to.be.ok;
        expect(data.foo).to.be.equal('bar');
        expect(data.foos).to.be.equal('bars');
        await this.t.commit();
      });
    });
  }

  describe('define', () => {
    it('adds a new dao to the dao manager', function() {
      const count = this.sequelize.modelManager.all.length;
      this.sequelize.define('foo', { title: DataTypes.STRING });
      expect(this.sequelize.modelManager.all.length).to.equal(count + 1);
    });

    it('adds a new dao to sequelize.models', function() {
      expect(this.sequelize.models.bar).to.equal(undefined);
      const Bar = this.sequelize.define('bar', { title: DataTypes.STRING });
      expect(this.sequelize.models.bar).to.equal(Bar);
    });

    it('overwrites global options', () => {
      const sequelize = Support.createSequelizeInstance({ define: { collate: 'utf8_general_ci' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING }, { collate: 'utf8_bin' });
      expect(DAO.options.collate).to.equal('utf8_bin');
    });

    it('overwrites global rowFormat options', () => {
      const sequelize = Support.createSequelizeInstance({ define: { rowFormat: 'compact' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING }, { rowFormat: 'default' });
      expect(DAO.options.rowFormat).to.equal('default');
    });

    it('inherits global collate option', () => {
      const sequelize = Support.createSequelizeInstance({ define: { collate: 'utf8_general_ci' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING });
      expect(DAO.options.collate).to.equal('utf8_general_ci');
    });

    it('inherits global rowFormat option', () => {
      const sequelize = Support.createSequelizeInstance({ define: { rowFormat: 'default' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING });
      expect(DAO.options.rowFormat).to.equal('default');
    });

    it('uses the passed tableName', async function() {
      const Photo = this.sequelize.define('Foto', { name: DataTypes.STRING }, { tableName: 'photos' });
      await Photo.sync({ force: true });
      let tableNames = await this.sequelize.getQueryInterface().showAllTables();
      if (dialect === 'mssql' || dialect === 'mariadb') {
        tableNames = tableNames.map(v => v.tableName);
      }
      expect(tableNames).to.include('photos');
    });
  });

  describe('truncate', () => {
    it('truncates all models', async function() {
      const Project = this.sequelize.define(`project${config.rand()}`, {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        title: DataTypes.STRING
      });

      await this.sequelize.sync({ force: true });
      const project = await Project.create({ title: 'bla' });
      expect(project).to.exist;
      expect(project.title).to.equal('bla');
      expect(project.id).to.equal(1);
      await this.sequelize.truncate();
      const projects = await Project.findAll({});
      expect(projects).to.exist;
      expect(projects).to.have.length(0);
    });
  });

  describe('sync', () => {
    it('synchronizes all models', async function() {
      const Project = this.sequelize.define(`project${config.rand()}`, { title: DataTypes.STRING });
      const Task = this.sequelize.define(`task${config.rand()}`, { title: DataTypes.STRING });

      await Project.sync({ force: true });
      await Task.sync({ force: true });
      await Project.create({ title: 'bla' });
      const task = await Task.create({ title: 'bla' });
      expect(task).to.exist;
      expect(task.title).to.equal('bla');
    });

    it('works with correct database credentials', async function() {
      const User = this.sequelize.define('User', { username: DataTypes.STRING });
      await User.sync();
      expect(true).to.be.true;
    });

    it('fails with incorrect match condition', async function() {
      const sequelize = new Sequelize('cyber_bird', 'user', 'pass', {
        dialect: this.sequelize.options.dialect
      });

      sequelize.define('Project', { title: Sequelize.STRING });
      sequelize.define('Task', { title: Sequelize.STRING });

      await expect(sequelize.sync({ force: true, match: /$phoenix/ }))
        .to.be.rejectedWith('Database "cyber_bird" does not match sync match parameter "/$phoenix/"');
    });

    if (dialect !== 'sqlite') {
      it('fails for incorrect connection even when no models are defined', async function() {
        const sequelize = new Sequelize('cyber_bird', 'user', 'pass', {
          dialect: this.sequelize.options.dialect
        });

        await expect(sequelize.sync({ force: true })).to.be.rejected;
      });

      it('fails with incorrect database credentials (1)', async function() {
        this.sequelizeWithInvalidCredentials = new Sequelize('omg', 'bar', null, _.omit(this.sequelize.options, ['host']));

        const User2 = this.sequelizeWithInvalidCredentials.define('User', { name: DataTypes.STRING, bio: DataTypes.TEXT });

        try {
          await User2.sync();
          expect.fail();
        } catch (err) {
          if (dialect === 'postgres' || dialect === 'postgres-native') {
            assert([
              'fe_sendauth: no password supplied',
              'role "bar" does not exist',
              'FATAL:  role "bar" does not exist',
              'password authentication failed for user "bar"'
            ].includes(err.message.trim()));
          } else if (dialect === 'mssql') {
            expect(err.message).to.equal('Login failed for user \'bar\'.');
          } else {
            expect(err.message.toString()).to.match(/.*Access denied.*/);
          }
        }
      });

      it('fails with incorrect database credentials (2)', async function() {
        const sequelize = new Sequelize('db', 'user', 'pass', {
          dialect: this.sequelize.options.dialect
        });

        sequelize.define('Project', { title: Sequelize.STRING });
        sequelize.define('Task', { title: Sequelize.STRING });

        await expect(sequelize.sync({ force: true })).to.be.rejected;
      });

      it('fails with incorrect database credentials (3)', async function() {
        const sequelize = new Sequelize('db', 'user', 'pass', {
          dialect: this.sequelize.options.dialect,
          port: 99999
        });

        sequelize.define('Project', { title: Sequelize.STRING });
        sequelize.define('Task', { title: Sequelize.STRING });

        await expect(sequelize.sync({ force: true })).to.be.rejected;
      });

      it('fails with incorrect database credentials (4)', async function() {
        const sequelize = new Sequelize('db', 'user', 'pass', {
          dialect: this.sequelize.options.dialect,
          port: 99999,
          pool: {}
        });

        sequelize.define('Project', { title: Sequelize.STRING });
        sequelize.define('Task', { title: Sequelize.STRING });

        await expect(sequelize.sync({ force: true })).to.be.rejected;
      });

      it('returns an error correctly if unable to sync a foreign key referenced model', async function() {
        this.sequelize.define('Application', {
          authorID: {
            type: Sequelize.BIGINT,
            allowNull: false,
            references: {
              model: 'User',
              key: 'id'
            }
          }
        });

        await expect(this.sequelize.sync()).to.be.rejected;
      });

      it('handles this dependant foreign key constraints', async function() {
        const block = this.sequelize.define('block', {
          id: { type: DataTypes.INTEGER, primaryKey: true },
          name: DataTypes.STRING
        }, {
          tableName: 'block',
          timestamps: false,
          paranoid: false
        });

        block.hasMany(block, {
          as: 'childBlocks',
          foreignKey: 'parent',
          joinTableName: 'link_block_block',
          useJunctionTable: true,
          foreignKeyConstraint: true
        });
        block.belongsTo(block, {
          as: 'parentBlocks',
          foreignKey: 'child',
          joinTableName: 'link_block_block',
          useJunctionTable: true,
          foreignKeyConstraint: true
        });

        await this.sequelize.sync();
      });
    }

    it('return the sequelize instance after syncing', async function() {
      const sequelize = await this.sequelize.sync();
      expect(sequelize).to.deep.equal(this.sequelize);
    });

    it('return the single dao after syncing', async function() {
      const block = this.sequelize.define('block', {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        name: DataTypes.STRING
      }, {
        tableName: 'block',
        timestamps: false,
        paranoid: false
      });

      const result = await block.sync();
      expect(result).to.deep.equal(block);
    });

    it('handles alter: true with underscore correctly', async function() {
      this.sequelize.define('access_metric', {
        user_id: {
          type: DataTypes.INTEGER
        }
      }, {
        underscored: true
      });

      await this.sequelize.sync({
        alter: true
      });
    });

    describe("doesn't emit logging when explicitly saying not to", () => {
      afterEach(function() {
        this.sequelize.options.logging = false;
      });

      beforeEach(function() {
        this.spy = sinon.spy();
        this.sequelize.options.logging = () => { this.spy(); };
        this.User = this.sequelize.define('UserTest', { username: DataTypes.STRING });
      });

      it('through Sequelize.sync()', async function() {
        this.spy.resetHistory();
        await this.sequelize.sync({ force: true, logging: false });
        expect(this.spy.notCalled).to.be.true;
      });

      it('through DAOFactory.sync()', async function() {
        this.spy.resetHistory();
        await this.User.sync({ force: true, logging: false });
        expect(this.spy.notCalled).to.be.true;
      });
    });

    describe('match', () => {
      it('will return an error not matching', function() {
        expect(
          this.sequelize.sync({
            force: true,
            match: /alibabaizshaek/
          })
        ).to.be.rejected;
      });
    });
  });

  describe('drop should work', () => {
    it('correctly succeeds', async function() {
      const User = this.sequelize.define('Users', { username: DataTypes.STRING });
      await User.sync({ force: true });
      await User.drop();
    });
  });

  describe('define', () => {
    it('raises an error if no values are defined', function() {
      expect(() => {
        this.sequelize.define('omnomnom', {
          bla: { type: DataTypes.ARRAY }
        });
      }).to.throw(Error, 'ARRAY is missing type definition for its values.');
    });
  });

  describe('define', () => {
    [
      { type: DataTypes.ENUM, values: ['scheduled', 'active', 'finished'] },
      DataTypes.ENUM('scheduled', 'active', 'finished')
    ].forEach(status => {
      describe('enum', () => {
        beforeEach(async function() {
          this.sequelize = Support.createSequelizeInstance({
            typeValidation: true
          });

          this.Review = this.sequelize.define('review', { status });
          await this.Review.sync({ force: true });
        });

        it('raises an error if no values are defined', function() {
          expect(() => {
            this.sequelize.define('omnomnom', {
              bla: { type: DataTypes.ENUM }
            });
          }).to.throw(Error, 'Values for ENUM have not been defined.');
        });

        it('correctly stores values', async function() {
          const review = await this.Review.create({ status: 'active' });
          expect(review.status).to.equal('active');
        });

        it('correctly loads values', async function() {
          await this.Review.create({ status: 'active' });
          const reviews = await this.Review.findAll();
          expect(reviews[0].status).to.equal('active');
        });

        it("doesn't save an instance if value is not in the range of enums", async function() {
          try {
            await this.Review.create({ status: 'fnord' });
          } catch (err) {
            expect(err).to.be.instanceOf(Error);
            expect(err.message).to.equal('"fnord" is not a valid choice in ["scheduled","active","finished"]');
          }
        });
      });
    });

    describe('table', () => {
      [
        { id: { type: DataTypes.BIGINT, primaryKey: true } },
        { id: { type: DataTypes.STRING, allowNull: true, primaryKey: true } },
        { id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true } }
      ].forEach(customAttributes => {

        it('should be able to override options on the default attributes', async function() {
          const Picture = this.sequelize.define('picture', _.cloneDeep(customAttributes));
          await Picture.sync({ force: true });
          Object.keys(customAttributes).forEach(attribute => {
            Object.keys(customAttributes[attribute]).forEach(option => {
              const optionValue = customAttributes[attribute][option];
              if (typeof optionValue === 'function' && optionValue() instanceof DataTypes.ABSTRACT) {
                expect(Picture.rawAttributes[attribute][option] instanceof optionValue).to.be.ok;
              } else {
                expect(Picture.rawAttributes[attribute][option]).to.be.equal(optionValue);
              }
            });
          });
        });

      });
    });

    if (current.dialect.supports.transactions) {
      describe('transaction', () => {
        beforeEach(async function() {
          const sequelize = await Support.prepareTransactionTest(this.sequelize);
          this.sequelizeWithTransaction = sequelize;
        });

        it('is a transaction method available', () => {
          expect(Support.Sequelize).to.respondTo('transaction');
        });

        it('passes a transaction object to the callback', async function() {
          const t = await this.sequelizeWithTransaction.transaction();
          expect(t).to.be.instanceOf(Transaction);
        });

        it('allows me to define a callback on the result', async function() {
          const t = await this.sequelizeWithTransaction.transaction();
          await t.commit();
        });

        if (dialect === 'sqlite') {
          it('correctly scopes transaction from other connections', async function() {
            const TransactionTest = this.sequelizeWithTransaction.define('TransactionTest', { name: DataTypes.STRING }, { timestamps: false });

            const count = async transaction => {
              const sql = this.sequelizeWithTransaction.getQueryInterface().queryGenerator.selectQuery('TransactionTests', { attributes: [['count(*)', 'cnt']] });

              const result = await this.sequelizeWithTransaction.query(sql, { plain: true, transaction });

              return result.cnt;
            };

            await TransactionTest.sync({ force: true });
            const t1 = await this.sequelizeWithTransaction.transaction();
            this.t1 = t1;
            await this.sequelizeWithTransaction.query(`INSERT INTO ${qq('TransactionTests')} (${qq('name')}) VALUES ('foo');`, { transaction: t1 });
            await expect(count()).to.eventually.equal(0);
            await expect(count(this.t1)).to.eventually.equal(1);
            await this.t1.commit();

            await expect(count()).to.eventually.equal(1);
          });
        } else {
          it('correctly handles multiple transactions', async function() {
            const TransactionTest = this.sequelizeWithTransaction.define('TransactionTest', { name: DataTypes.STRING }, { timestamps: false });
            const aliasesMapping = new Map([['_0', 'cnt']]);

            const count = async transaction => {
              const sql = this.sequelizeWithTransaction.getQueryInterface().queryGenerator.selectQuery('TransactionTests', { attributes: [['count(*)', 'cnt']] });

              const result = await this.sequelizeWithTransaction.query(sql, { plain: true, transaction, aliasesMapping  });

              return parseInt(result.cnt, 10);
            };

            await TransactionTest.sync({ force: true });
            const t1 = await this.sequelizeWithTransaction.transaction();
            this.t1 = t1;
            await this.sequelizeWithTransaction.query(`INSERT INTO ${qq('TransactionTests')} (${qq('name')}) VALUES ('foo');`, { transaction: t1 });
            const t2 = await this.sequelizeWithTransaction.transaction();
            this.t2 = t2;
            await this.sequelizeWithTransaction.query(`INSERT INTO ${qq('TransactionTests')} (${qq('name')}) VALUES ('bar');`, { transaction: t2 });
            await expect(count()).to.eventually.equal(0);
            await expect(count(this.t1)).to.eventually.equal(1);
            await expect(count(this.t2)).to.eventually.equal(1);
            await this.t2.rollback();
            await expect(count()).to.eventually.equal(0);
            await this.t1.commit();

            await expect(count()).to.eventually.equal(1);
          });
        }

        it('supports nested transactions using savepoints', async function() {
          const User = this.sequelizeWithTransaction.define('Users', { username: DataTypes.STRING });

          await User.sync({ force: true });
          const t1 = await this.sequelizeWithTransaction.transaction();
          const user = await User.create({ username: 'foo' }, { transaction: t1 });
          const t2 = await this.sequelizeWithTransaction.transaction({ transaction: t1 });
          await user.update({ username: 'bar' }, { transaction: t2 });
          await t2.commit();
          const newUser = await user.reload({ transaction: t1 });
          expect(newUser.username).to.equal('bar');

          await t1.commit();
        });

        describe('supports rolling back to savepoints', () => {
          beforeEach(async function() {
            this.User = this.sequelizeWithTransaction.define('user', {});
            await this.sequelizeWithTransaction.sync({ force: true });
          });

          it('rolls back to the first savepoint, undoing everything', async function() {
            const transaction = await this.sequelizeWithTransaction.transaction();
            this.transaction = transaction;

            const sp1 = await this.sequelizeWithTransaction.transaction({ transaction });
            this.sp1 = sp1;
            await this.User.create({}, { transaction: this.transaction });
            const sp2 = await this.sequelizeWithTransaction.transaction({ transaction: this.transaction });
            this.sp2 = sp2;
            await this.User.create({}, { transaction: this.transaction });
            const users0 = await this.User.findAll({ transaction: this.transaction });
            expect(users0).to.have.length(2);

            await this.sp1.rollback();
            const users = await this.User.findAll({ transaction: this.transaction });
            expect(users).to.have.length(0);

            await this.transaction.rollback();
          });

          it('rolls back to the most recent savepoint, only undoing recent changes', async function() {
            const transaction = await this.sequelizeWithTransaction.transaction();
            this.transaction = transaction;

            const sp1 = await this.sequelizeWithTransaction.transaction({ transaction });
            this.sp1 = sp1;
            await this.User.create({}, { transaction: this.transaction });
            const sp2 = await this.sequelizeWithTransaction.transaction({ transaction: this.transaction });
            this.sp2 = sp2;
            await this.User.create({}, { transaction: this.transaction });
            const users0 = await this.User.findAll({ transaction: this.transaction });
            expect(users0).to.have.length(2);

            await this.sp2.rollback();
            const users = await this.User.findAll({ transaction: this.transaction });
            expect(users).to.have.length(1);

            await this.transaction.rollback();
          });
        });

        it('supports rolling back a nested transaction', async function() {
          const User = this.sequelizeWithTransaction.define('Users', { username: DataTypes.STRING });

          await User.sync({ force: true });
          const t1 = await this.sequelizeWithTransaction.transaction();
          const user = await User.create({ username: 'foo' }, { transaction: t1 });
          const t2 = await this.sequelizeWithTransaction.transaction({ transaction: t1 });
          await user.update({ username: 'bar' }, { transaction: t2 });
          await t2.rollback();
          const newUser = await user.reload({ transaction: t1 });
          expect(newUser.username).to.equal('foo');

          await t1.commit();
        });

        it('supports rolling back outermost transaction', async function() {
          const User = this.sequelizeWithTransaction.define('Users', { username: DataTypes.STRING });

          await User.sync({ force: true });
          const t1 = await this.sequelizeWithTransaction.transaction();
          const user = await User.create({ username: 'foo' }, { transaction: t1 });
          const t2 = await this.sequelizeWithTransaction.transaction({ transaction: t1 });
          await user.update({ username: 'bar' }, { transaction: t2 });
          await t1.rollback();
          const users = await User.findAll();
          expect(users.length).to.equal(0);
        });
      });
    }
  });

  describe('databaseVersion', () => {
    it('should database/dialect version', async function() {
      const version = await this.sequelize.databaseVersion();
      expect(typeof version).to.equal('string');
      expect(version).to.be.ok;
    });
  });

  describe('paranoid deletedAt non-null default value', () => {
    it('should use defaultValue of deletedAt in paranoid clause and restore', async function() {
      const epochObj = new Date(0),
        epoch = Number(epochObj);
      const User = this.sequelize.define('user', {
        username: DataTypes.STRING,
        deletedAt: {
          type: DataTypes.DATE,
          defaultValue: epochObj
        }
      }, {
        paranoid: true
      });

      await this.sequelize.sync({ force: true });
      const user = await User.create({ username: 'user1' });
      expect(Number(user.deletedAt)).to.equal(epoch);

      const user0 = await User.findOne({
        where: {
          username: 'user1'
        }
      });

      expect(user0).to.exist;
      expect(Number(user0.deletedAt)).to.equal(epoch);
      const destroyedUser = await user0.destroy();
      expect(destroyedUser.deletedAt).to.exist;
      expect(Number(destroyedUser.deletedAt)).not.to.equal(epoch);
      const fetchedDestroyedUser = await User.findByPk(destroyedUser.id, { paranoid: false });
      expect(fetchedDestroyedUser.deletedAt).to.exist;
      expect(Number(fetchedDestroyedUser.deletedAt)).not.to.equal(epoch);
      const restoredUser = await fetchedDestroyedUser.restore();
      expect(Number(restoredUser.deletedAt)).to.equal(epoch);

      await User.destroy({ where: {
        username: 'user1'
      } });

      const count = await User.count();
      expect(count).to.equal(0);
      await User.restore();
      const nonDeletedUsers = await User.findAll();
      expect(nonDeletedUsers.length).to.equal(1);
      nonDeletedUsers.forEach(u => {
        expect(Number(u.deletedAt)).to.equal(epoch);
      });
    });
  });
});
