import ObjectHash from 'object-hash';
import DataLoader from './MongoGraphql';

class DB {
  constructor(db, collection) {
    this.collection = db.collection(collection);
    this.dataLoaders = {};
  }

  dataLoader = (selector, pk) => {
    let key = ObjectHash({ pk, selector });
    if (!this.dataLoaders[key]) {
      this.dataLoaders[key] = new DataLoader(
        keys => {
          return this.collection.find({ [pk]: { $in: keys }, ...selector })
            .toArray()
            .then(data =>
              keys.map(
                key =>
                  data.find(
                    item => item[pk].toString() === key.toString(),
                  ) || null,
              ),
            );
        },
        { cache: false },
      );
    }
    return this.dataLoaders[key];
  };


}



