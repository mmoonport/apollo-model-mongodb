import { defaultFieldResolver } from 'graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';

import _ from 'lodash';

import { GraphQLID, GraphQLList } from 'graphql';

import {
  FIND,
  FIND_ONE,
  DISTINCT,
  COUNT,
  getInputType,
  getLastType,
  hasQLListType,
  mapFiltersToSelector,
  getRelationFieldName,
  allQueryArgs,
  GraphQLTypeFromString,
  combineResolvers,
  getInputTypeName,
  applyInputTransform,
} from '../utils';

import InputTypes from '../inputTypes';

export const RelationScheme = `directive @relation(field:String="_id", fieldType:String="ObjectID" ) on FIELD_DEFINITION`;

export default queryExecutor =>
  class RelationDirective extends SchemaDirectiveVisitor {
    visitFieldDefinition(field, { objectType }) {
      const { _typeMap: SchemaTypes } = this.schema;
      const { field: relationField } = this.args;

      this.mmObjectType = objectType;
      this.mmInputTypes = new InputTypes({ SchemaTypes });
      this.mmLastType = getLastType(field.type);
      this.mmIsMany = hasQLListType(field.type);
      this.mmStoreField = getRelationFieldName(
        this.mmLastType.name,
        relationField,
        this.mmIsMany
      );

      if (!field.mmTransformToInput) field.mmTransformToInput = {};
      field.mmTransformToInput.orderBy = field => [];
      field.mmTransformToInput.create = field => {};
      field.mmTransformToInput.where = this._transformToInputWhere;
      field.mmOnSchemaInit = this._onSchemaInit;

      field.resolve = this.mmIsMany
        ? this._resolveMany(field)
        : this._resolveSingle(field);
    }

    _mmTransformToInputWhere = async field => {
      const { field: relationField } = this.args;
      let {
        mmLastType: lastType,
        mmIsMany: isMany,
        mmStoreField: storeField,
      } = this;

      let collection = lastType.name;
      let inputType = this.mmInputTypes.get(lastType, 'where');
      let modifiers = isMany ? ['some', 'none'] : [''];
      let fields = {};
      modifiers.forEach(modifier => {
        let fieldName = field.name;
        if (modifier != '') {
          fieldName = `${field.name}_${modifier}`;
        }
        fields[fieldName] = {
          name: fieldName,
          type: inputType,
          mmTransform: async params => {
            params = params[field.name];
            let value = await queryExecutor({
              type: DISTINCT,
              collection,
              selector: await applyInputTransform(params, inputType),
              options: {
                key: relationField,
              },
            });
            // if (!isMany) {
            value = { $in: value };
            // }
            return { [storeField]: value };
          },
        };
      });
      return fields;
    };

    _onSchemaInit = field => {
      let { mmLastType: lastType, mmIsMany: isMany } = this;

      if (isMany) {
        let whereType = this.mmInputTypes.get(lastType, 'where');
        let orderByType = this.mmInputTypes.get(lastType, 'orderBy');

        field.args = allQueryArgs({
          filterType: whereType,
          orderByType,
        });

        this._addMetaField(field);
      }
    };

    _resolveSingle = field => async (parent, args, context, info) => {
      const { field: relationField } = this.args;
      let {
        mmLastType: lastType,
        mmIsMany: isMany,
        mmStoreField: storeField,
      } = this;

      let value = parent[storeField];
      let selector = {
        [relationField]: value,
      };

      return queryExecutor({
        type: FIND_ONE,
        collection: lastType.name,
        selector: { [relationField]: value },
        options: { skip: args.skip, limit: args.first },
        context,
      });
    };

    _resolveMany = field => async (parent, args, context, info) => {
      const { field: relationField } = this.args;
      let {
        mmLastType: lastType,
        mmIsMany: isMany,
        mmStoreField: storeField,
      } = this;

      let whereType = this.mmInputTypes.get(lastType, 'where');

      let value = parent[storeField];
      if (_.isArray(value)) {
        value = { $in: value };
      }
      let selector = {
        ...(await applyInputTransform(args.where, whereType)),
        [relationField]: value,
      };
      return queryExecutor({
        type: FIND,
        collection: lastType.name,
        selector,
        options: { skip: args.skip, limit: args.first },
        context,
      });
    };

    _addMetaField = field => {
      const { field: relationField } = this.args;
      let {
        mmLastType: lastType,
        mmIsMany: isMany,
        mmStoreField: storeField,
      } = this;
      const { _typeMap: SchemaTypes } = this.schema;

      let whereType = this.mmInputTypes.get(lastType, 'where');
      let orderByType = this.mmInputTypes.get(lastType, 'orderBy');

      let metaName = `_${field.name}Meta`;
      this.mmObjectType._fields[metaName] = {
        name: metaName,
        skipFilter: true,
        skipCreate: true,
        isDeprecated: false,
        args: allQueryArgs({
          filterType: whereType,
          orderByType,
        }),
        type: SchemaTypes._QueryMeta,
        resolve: async (parent, args, context, info) => {
          let value = parent[storeField];
          if (_.isArray(value)) {
            value = { $in: value };
          }
          let selector = {
            ...(await applyInputTransform(args.where, whereType)),
            [relationField]: value,
          };
          return {
            count: queryExecutor({
              type: COUNT,
              collection: lastType.name,
              selector,
              options: { skip: args.skip, limit: args.first },
              context,
            }),
          };
        },
      };
    };
  };