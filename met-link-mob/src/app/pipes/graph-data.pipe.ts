import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'graphData',
  standalone: true
})
export class GraphFilter implements PipeTransform {
  private acceptedGraphData = ["Wind speed","Wind direction","Pressure","Current","Voltage","Humidity","Temperature","GPS height","QFE","QNH","Dew point"];
    transform(value: any[]) {
    return value.filter( value => {
      for(var i = 0; i < this.acceptedGraphData.length; i++)
      {
        if(value.Type == this.acceptedGraphData[i])
        {
          return true;
        }
      }
      return false;
    });
  }
}

