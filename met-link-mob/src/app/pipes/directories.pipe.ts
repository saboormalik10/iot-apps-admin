import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'directories',
  standalone: true
})
export class Directories implements PipeTransform {

  transform(value: any[]) {
    return value.filter( value => {
      if(value.isFile == 1)
      {
        return false;
      }
      return true;
    });
  }
}
