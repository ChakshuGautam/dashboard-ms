import { Injectable } from '@angular/core';
import { getBarDatasetConfig, getChartJSConfig } from '../config/ChartjsConfig';
import { CommonService } from './common/common.service';
import * as _ from 'lodash';
import { WrapperService } from './wrapper.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  constructor(private _commonService: CommonService, private _wrapperService: WrapperService) { }

  getTableReportData(query, options): Promise<any> {
    return new Promise((resolve, reject) => {
      this._commonService.getReportDataNew(query).subscribe((res: any) => {
        let rows = res;
        let { table: { columns, groupByNeeded, metricLabelProp, metricValueProp } } = options;
        let newColumns: any = [];
        if (groupByNeeded) {
          let { result, newColumnsProps } = this.tableGroupBy(rows, columns.filter((column: any) => !column?.groupByNeeded || column?.groupByNeeded === undefined).map((column) => column?.property), metricLabelProp, metricValueProp)
          rows = result
          let transposeColumn = columns.filter(col => col.property === metricLabelProp)[0]
          newColumnsProps.forEach((newColProp) => {
            newColumns.push({
              ...transposeColumn,
              property: newColProp,
              name: newColProp
            })
          })
          columns = columns.concat(newColumns)
        }

        let reportData = {
          data: rows.map(row => {
            columns.forEach((col: any) => {
              let cellValue = row[col.property];
              if (cellValue === null || cellValue === undefined) {
                cellValue = "N/A";
              }
              row = {
                ...row,
                [col.property]: { value: cellValue }
              }
            });
            return row;
          }),
          columns: columns.filter(col => {
            if (rows[0] && col.property in rows[0] && col.property !== metricLabelProp) {
              return col;
            }
          })
        }
        resolve(reportData);
      })
    });
  }


  getBigNumberReportData(query: string, options: any, indicator: string, prevReportData: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let { bigNumber } = options ?? {};
      let { valueSuffix, property, title } = bigNumber ?? {};
      let reportData = {
        ...prevReportData,
        valueSuffix: valueSuffix,
        reportName: title
      }
      if (indicator === 'averagePercentage') {
        this._commonService.getReportDataNew(query).subscribe((res: any) => {
          if (res) {
            let rows = res;
            reportData = {
              ...reportData,
              averagePercentage: rows[0]?.[property]
            }
            resolve(reportData)
          }
        })
      }
      else if (indicator === 'differencePercentage') {
        this._commonService.getReportDataNew(query).subscribe((res: any) => {
          if (res) {
            let rows = res;
            reportData = {
              ...reportData,
              differencePercentage: rows[0]?.[property]
            }
            resolve(reportData)
          }
        })
      }
    });
  }

  getBarChartReportData(query, options, filters, defaultLevel): Promise<any> {
    return new Promise((resolve, reject) => {
      let { barChart: { yAxis, xAxis, isCorrelation, isMultibar, MultibarGroupByNeeded, valueSuffix,metricLabelProp, metricValueProp } } = options;
      this._commonService.getReportDataNew(query).subscribe((res: any) => {
        let rows = res;
        if (MultibarGroupByNeeded) {
          rows = this.multibarGroupBy(rows, xAxis.label, metricLabelProp, metricValueProp);
        }
        let reportData = {
          values: rows
        }
        let config = getChartJSConfig({
          labelExpr: xAxis.value,
          datasets: this.getDatasets(options.barChart, filters),

          options: {
            height: (rows.length * 15 + 150).toString(),
            tooltips: {
              callbacks: {
                label: (tooltipItem, data) => {
                  let multistringText = [];
                  if (isMultibar) {
                    data.datasets.forEach((dataset: any, index: any) => {
                      if (index === tooltipItem.datasetIndex) {
                        multistringText.push(`${dataset.label} : ${tooltipItem.value} ${valueSuffix !== undefined ? valueSuffix : ''}`)
                      }
                    })
                  }
                  else {
                    multistringText.push(`${data.datasets[0].label} : ${tooltipItem.value} ${valueSuffix !== undefined ? valueSuffix : ''}`)
                  }
                  return multistringText;
                }
              }
            },
            scales: {
              yAxes: [{
                scaleLabel: {
                  display: true,
                  labelString: yAxis.title
                }
              }],
              xAxes: [{
                scaleLabel: {
                  display: true,
                  labelString: xAxis.title
                },
                ticks: {
                  callback: function (value, index, values) {
                    let newValue = value.split('_').map((word: any) => word[0].toUpperCase() + word.substring(1)).join(' ')
                    if (screen.width <= 768) {
                      return newValue.substr(0, 8) + '...';
                    } else {
                      return newValue;
                    }
                  }
                }
              }]
            }
          }
        });
        resolve({ reportData: reportData, config: config })
      });
    });
  }

  getDatasets(barChartOptions: any, filters: any) {
    let { xAxis, isCorrelation, isMultibar, metricLabelProp, metricValueProp } = barChartOptions;
    if (isCorrelation) {
      return getBarDatasetConfig(
        filters.map((filter: any) => {
          return {
            dataExpr: filter.value, label: xAxis?.metrics?.filter((metric: any) => {
              return metric.value === filter.value
            })[0].label
          }
        })
      )
    }
    else if (isMultibar) {
      return getBarDatasetConfig(
        xAxis?.metrics.map((metric: any) => {
          return {
            dataExpr: metric.value,
            label: metric.label
          }
        })
      )
    }
    else {
      return getBarDatasetConfig([{
        dataExpr: metricValueProp, label: metricLabelProp
      }])
    }
  }

  getMapReportData(query: any, options: any, filters: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let reportData;
      this._commonService.getReportDataNew(query).subscribe((res: any) => {
        let rows = res;
        let { map: { indicator, indicatorType, legend, metricFilterNeeded, tooltipMetrics, metricLabelProp, metricValueProp, groupByColumn } } = options ?? {};
        let metricFilter;
        if (metricFilterNeeded) {
          metricFilter = filters.filter((filter: any) => {
            return filter.filterType === 'metric'
          })[0]
          rows = this.mapGroupBy(rows, groupByColumn, metricLabelProp, metricValueProp, tooltipMetrics, metricFilter.value)
        }

        reportData = {
          data: rows.map(row => {
            row = {
              ...row,
              Latitude: row['latitude'],
              Longitude: row['longitude'],
              indicator: metricFilter ? isNaN(row[metricFilter.value]) ? row[metricFilter.value] : Number(row[metricFilter.value]) : isNaN(row[indicator]) ? row[indicator] : Number(row[indicator]),
              tooltip: row.tooltip ? row.tooltip : this._wrapperService.constructTooltip(tooltipMetrics, row, metricFilter ? metricFilter.value : indicator)
            };

            return row;
          }),
          options: {
            reportIndicatorType: indicatorType,
            legend,
            selectedMetric: metricFilter ? metricFilter.options?.filter(option => option.value === metricFilter.value)[0]?.label : undefined
          }
        }
        resolve(reportData)
      },
        (error) => {
          reportData = undefined
          resolve(reportData)
        }
      );
    })
  }

  multibarGroupBy(data: any, groupByLabel: any, metricLabelProp: string, metricValueProp: string) {
    let result = _.chain(data).groupBy(groupByLabel).map((objs, key) => {
      data = {
        [groupByLabel]: key
      }
      objs?.forEach((obj: any) => {
        data = {
          ...data,
          [obj[metricLabelProp]]: obj[metricValueProp]
        }
      });
      return data;
    }).value()
    return result;
  }

  mapGroupBy(data: any, groupByLabel: any, metricLabelProp: string, metricValueProp: string, tooltipMetrics: any, metricFilterValue: any) {
    let result = _.chain(data).groupBy(groupByLabel).map((objs, key) => {
      data = {
        [groupByLabel]: key,
      }
      objs?.forEach((obj: any, index: any) => {
        let modifiedTooltipMetrics = tooltipMetrics.filter(metric => metricLabelProp === metric.value).map((metric: any) => {
          return {
            ...metric,
            valuePrefix: obj[metricLabelProp] + ': ',
            value: obj[metricLabelProp]
          }
        })
        data = {
          ...data,
          ...obj,
          // district_code: obj['district_id'] ? Number(obj['district_id']) : null,
          [obj[metricLabelProp]]: obj[metricValueProp]
        }
        if (index === 0) {
          data['tooltip'] = this._wrapperService.constructTooltip(tooltipMetrics.filter(metric => metricLabelProp !== metric.value), data, metricFilterValue)
        }
        data['tooltip'] += this._wrapperService.constructTooltip(modifiedTooltipMetrics, data, metricFilterValue)
      });
      return data;
    }).value()
    return result;
  }

  tableGroupBy(data: any, groupByLabel: any, metricLabelProp: string, metricValueProp: string) {
    let newColumnsProps = [];
    let result = _.chain(data).groupBy(Array.isArray(groupByLabel) ? (data) => {
      let combinedLabel: string = '';
      groupByLabel.forEach((label) => {
        combinedLabel += '_' + data[label]
      })
      return combinedLabel
    } : groupByLabel).map((objs, key) => {
      let tempData;
      objs?.forEach((obj: any) => {
        tempData = {
          ...tempData,
          ...obj,
          [obj[metricLabelProp]]: obj[metricValueProp] || "NA"
        }
        if (!newColumnsProps.includes(obj[metricLabelProp])) {
          newColumnsProps.push(obj[metricLabelProp])
        }
      });
      return tempData;
    }).value()
    return { result, newColumnsProps };
  }
  
}
