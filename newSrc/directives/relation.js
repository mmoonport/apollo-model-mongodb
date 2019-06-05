import { mongoGraphqlConfig } from '../MongoGraphql';
import Types, { Modifiers, Mods } from '../inputTypes';
import * as KINDS from '../inputTypes/kinds';
import TypeWrap from '../../src/typeWrap';

mongoGraphqlConfig.buildDirective(
  'relationship',
  `directive @relationship(name:String) on FIELD`,
  {
    visitFieldDefinition(field, { objectType: parentType }) {
      let wrap = new TypeWrap(field.type);
      let subType = wrap.realType();
      let createType = Types.inputFor(KINDS.CREATE_RELATION, parentType, subType, wrap.isMany());
      let updateType = Types.inputFor(KINDS.UPDATE_RELATION, parentType, subType, wrap.isMany());
      field.dbName = this.args.name || this.server.fieldNameResolver(field.name);
      field.relationship = true;
      field.resolve = wrap.isMany() ? this.resolveMany(field, parentType) : this.resolveSingle(field, parentType);
      field.createField = createType.createField;
      field.updateField = updateType.updateField;
      field.whereFields = this.buildWhereFields(field, parentType, subType);
    },
    buildWhereFields: (field, parentType, subType) => {
      let wrap = new TypeWrap(field.type);
      let relationWhereType = Types.inputFor(KINDS.WHERE_RELATION, parentType, subType);
      let fields = {
        [field.name]: {
          name: field.name,
          type: relationWhereType,
          process: async ({ where }, context, info) => {
            let ids = await relationWhereType.process(where, context, info);
            return { [field.dbName]: { $in: ids } };
          },
        },
      };
      let modifiers = Modifiers[wrap.isMany() ? 'ManyRelationship' : 'Relationship'];
      fields = {
        ...fields,
        ...modifiers.reduce((resp = {}, modifier) => {
          let name = this._fieldNameWithModifier(field.name, modifier);
          resp[name] = Mods[modifier](name, type);
          return resp;
        }),
      };
      return fields;
    },
    resolveMany: (field) => async (parent, args, context, info) => {
      let wrap = new TypeWrap(field.type);
      let subType = wrap.realType();
      let ids = parent[field.dbName];
      if (ids) {
        return await subType.findIds(ids, context, info);
      }
      return [];
    },
    resolveSingle: (field) => async (parent, args, context, info) => {
      let wrap = new TypeWrap(field.type);
      let subType = wrap.realType();
      let id = parent[field.dbName];
      if (id) {
        return await subType.findById(id, context, info);
      }
    },
  })
;
