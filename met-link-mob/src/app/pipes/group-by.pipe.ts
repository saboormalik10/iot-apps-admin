import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'groupBy',
  standalone: true,
})
export class GroupByPipe implements PipeTransform {
  transform(
    collection: any[],
    property: string
  ): { key: string; value: any[] }[] {
    if (!collection) {
      return [];
    }

    const groupedCollection = collection.reduce((previous, current) => {
      if (!previous[current[property]]) {
        previous[current[property]] = [current];
      } else {
        previous[current[property]].push(current);
      }
      return previous;
    }, {});

    return Object.keys(groupedCollection).map((key) => ({
      key,
      value: groupedCollection[key],
    }));
  }
}
