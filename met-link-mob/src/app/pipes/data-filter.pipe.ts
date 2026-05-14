import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'dataFilter',
  standalone: true,
})
export class DataFilter implements PipeTransform {
  transform(value: any) {
    return value.filter((value: any) => {
      if (value.EnShow == 0) {
        return false;
      }
      return true;
    });
  }
}
