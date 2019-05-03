import { SchemaDirectiveVisitor } from 'graphql-tools';
import pluralize from 'pluralize';

import SDLSyntaxException from '../../src/sdlSyntaxException';
import { getDirective, lowercaseFirstLetter } from '../../src/utils';

export const NO_INTERFACE_ARGS = 'noInterfaceArgs';
export const MULTIPLE_MODEL = 'multipleModel';
export const MODEL_WITH_EMBEDDED = 'modelWithEmbedded';

export const typeDef = `directive @model(collection:String=null, abstract:Boolean=false, from:String=null) on OBJECT | INTERFACE`;


const buildDirective = (directiveName, typeDef, visitors = {}) => (mananger) => {
  let visitor = class extends SchemaDirectiveVisitor {
    constructor(props) {
      super(props);
      this.manager = mananger;
    }

  };

  Object.entries(visitors).forEach(([key, method]) => {
    visitor[key] = method.bind(visitor);
  });

  return {
    typeDef,
    visitor,
  };
};


class Model extends SchemaDirectiveVisitor {
  visitObject(object) {
    const { collection } = this.args;
    object.collection = collection || object.name;

    //validate usage
    object._interfaces.forEach(iface => {
      if (getDirective(iface, 'model')) {
        throw new SDLSyntaxException(
          `Type '${
            object.name
            }' can not be marked with @model directive because it's interface ${
            iface.name
            } marked with @model directive`,
          NO_INTERFACE_ARGS,
          [object, iface],
        );
      }
      if (getDirective(iface, 'embedded')) {
        throw new SDLSyntaxException(
          `Type '${
            object.name
            }' can not be marked with @model directive because it's interface ${
            iface.name
            } marked with @embedded directive`,
          MODEL_WITH_EMBEDDED,
          [object, iface],
        );
      }
    });
  }

  visitInterface(iface) {
    const { collection, abstract } = this.args;
    if (!abstract) {
      object.collection;
    }

    const { _typeMap: SchemaTypes } = this.schema;

    Object.values(SchemaTypes)
      .filter(type => type._interfaces && type._interfaces.includes(iface))
      .forEach(type => {
        type.mmCollectionName = iface.mmCollectionName;

        //validate usage
        type._interfaces
          .filter(i => i != iface)
          .forEach(i => {
            if (getDirective(i, 'model')) {
              throw new SDLSyntaxException(
                `Type '${type.name}' can not inherit both '${
                  iface.name
                  }' and '${i.name}' because they marked with @model directive`,
                MULTIPLE_MODEL,
                [i, iface],
              );
            }
            if (getDirective(i, 'embedded')) {
              throw new SDLSyntaxException(
                `Type '${type.name}' can not inherit both '${
                  iface.name
                  }' and '${
                  i.name
                  }' because they marked with @model and @embedded directives`,
                MODEL_WITH_EMBEDDED,
                [i, iface],
              );
            }
          });
      });

    //Set discriminator
    if (!iface.mmDiscriminatorField) {
      iface.mmDiscriminatorField = '_type';
    }

    Object.values(SchemaTypes)
      .filter(type => type._interfaces && type._interfaces.includes(iface))
      .forEach(type => {
        if (!type.mmDiscriminator) {
          type.mmDiscriminator = lowercaseFirstLetter(type.name);
        }
      });
    iface.mmDiscriminatorMap = iface.mmDiscriminatorMap || {};

    iface.mmOnSchemaInit = () => {
      Object.values(SchemaTypes)
        .filter(
          type =>
            Array.isArray(type._interfaces) && type._interfaces.includes(iface),
        )
        .forEach(type => {
          type.mmDiscriminatorField = iface.mmDiscriminatorField;
          iface.mmDiscriminatorMap[type.mmDiscriminator] = type.name;
        });
    };

    iface.resolveType = doc => {
      return iface.mmDiscriminatorMap[doc[iface.mmDiscriminatorField]];
    };
    ////////////
  }
}

export const schemaDirectives = {
  model: Model,
};


export default buildDirective(
  'model',
  `directive @model(collection:String=null, abstract:Boolean=false, inherit:Boolean=false, from:String=null) on OBJECT | INTERFACE`,
  {
    visitObject(object) {
      let { abstract, inherit, from, collection } = this.args;
      if (abstract || from || inherit) {
        throw new SDLSyntaxException(
          `Type '${
            object.name
            }' can not be marked with abstract, inherit or from`,
          NO_INTERFACE_ARGS,
          [object],
        );
      }
      object.isModel = true;
      object.collection = collection || this.manager.collectionNameResolver(object.name);
      object.defaultSelector = (context) => {
        let selector = {};
        if (object._interfaces.length) {
          let iface = object._interfaces[0];
          selector = { ...selector, ...iface.defaultSelector(context) };
        }
        let defaultQueryResolver = prev => (c) => prev;
        let defaultQuery = object.defaultQuery || defaultQueryResolver;
        return defaultQuery(selector)(context);
      };
      this.manager.handleModel(object);
    },

    visitInterface(iface) {
      const { _typeMap: SchemaTypes } = this.schema;
      let { abstract, inherit, from, collection } = this.args;
      let fromInterface;
      if (from) {
        let { [from]: fromInterface } = SchemaTypes;
        if (!fromInterface) {
          throw new SDLSyntaxException(`Interface ${from} doesn't exist.`, 'invalidFrom', [iface]);
        }
        iface.from = fromInterface;
      }

      if (inherit && abstract) {
        throw new SDLSyntaxException(`Interface ${iface.name} cannot set be inherit and abstract`, 'conflictingInterfaceType', [iface]);
      }

      if (inherit) {
        if (fromInterface && fromInterface.inherit && collection) {
          throw new SDLSyntaxException(`Interface ${iface.name} cannot set collection ${collection} because it collection is set by inherited interface ${fromInterface.name}`, 'alreadyInherited', [iface, fromInterface]);
        }
        iface.inherit = true;
        if (fromInterface.inherit) {
          iface.inheritKey = `${fromInterface.inheritKey}.${iface.name}`;
          iface.inheritField = fromInterface.inheritField;
        } else {
          iface.inheritKey = iface.name;
          iface.inheritField = '_cls'; //TODO: Make this configurable
          iface.collection = collection || this.manager.collectionNameResolver(iface.name);

        }
      } else if (abstract) {
        iface.abstract = true;
        iface.collection = null;
      }

      iface.defaultSelector = (context, selector = {}) => {
        if (iface.from) {
          selector = { ...selector, ...iface.defaultSelector(context, selector) };
        }
        let defaultQueryResolver = prev => (c) => prev;
        let defaultQuery = iface.defaultQuery || defaultQueryResolver;
        return defaultQuery(selector)(context);
      };

    },
  });
