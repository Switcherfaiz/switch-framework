const _flatListStatesRegistered = new WeakSet();

function isSubclassOf(Cls, Base) {
  let proto = Cls?.prototype;
  while (proto) {
    if (proto.constructor === Base) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/** Registers FlatList subclasses and ensures default list states exist. */
export function registerFlatListClass(Cls, FlatList) {
  if (!Cls?.tag || !FlatList) return;
  if (Cls === FlatList || !isSubclassOf(Cls, FlatList)) return;
  if (typeof FlatList.registerStates === 'function') {
    FlatList.registerStates(Cls);
  }
}

export function isFlatListClass(Cls, FlatList) {
  return Cls === FlatList || isSubclassOf(Cls, FlatList);
}
