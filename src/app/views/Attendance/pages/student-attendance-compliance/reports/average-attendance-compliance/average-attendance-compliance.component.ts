import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonService } from 'src/app/core/services/common/common.service';
import { RbacService } from 'src/app/core/services/rbac-service.service';
import { WrapperService } from 'src/app/core/services/wrapper.service';
import { buildQuery, parseTimeSeriesQuery } from 'src/app/utilities/QueryBuilder';
import { environment } from 'src/environments/environment';
import { config } from '../../config/attendance_config';

@Component({
  selector: 'app-average-attendance-compliance',
  templateUrl: './average-attendance-compliance.component.html',
  styleUrls: ['./average-attendance-compliance.component.scss']
})
export class AverageAttendanceComplianceComponent implements OnInit {
  reportName: string = 'average_attendance_compliance';
  filters: any = [];
  levels: any;
  tableReportData: any;
  bigNumberReportData: any = {
    reportName: "Student Attendance Complaince"
  };
  startDate: any;
  endDate: any;
  minDate: any;
  maxDate: any;
  compareDateRange: any = 30;
  // level = environment.config === 'national' ? 'state' : 'district';
  filterIndex: any;
  rbacDetails: any;

  @Output() bigNumberReport = new EventEmitter<any>();

  constructor(private readonly _commonService: CommonService, private readonly _wrapperService: WrapperService, private _rbacService: RbacService) {
    this._rbacService.getRbacDetails().subscribe((rbacDetails: any) => {
      this.rbacDetails = rbacDetails;
    })
  }

  ngOnInit(): void {
    this.getReportData();
  }
  async getReportData(): Promise<void> {
    let reportConfig = config

    let { timeSeriesQueries, queries, levels, defaultLevel, filters, options } = reportConfig[this.reportName];
    let onLoadQuery;

    if (this.rbacDetails?.role) {
      filters.every((filter: any) => {
        if (Number(this.rbacDetails?.role) === Number(filter.hierarchyLevel)) {
          queries = filter?.actions?.queries
          timeSeriesQueries = filter?.timeSeriesQueries
          Object.keys(queries).forEach((key) => {
            queries[key] = this.parseRbacFilter(queries[key])
            timeSeriesQueries[key] = this.parseRbacFilter(timeSeriesQueries[key])
          });
          return false
        }
        return true
      })
    }
    else {
      this._wrapperService.constructFilters(this.filters, filters);
    }
    console.log(queries)

    Object.keys(queries).forEach((key: any) => {
      if (key.toLowerCase().includes('comparison')) {
        let endDate = new Date();
        let days = endDate.getDate() - this.compareDateRange;
        let startDate = new Date();
        startDate.setDate(days)
        onLoadQuery = parseTimeSeriesQuery(queries[key], startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
      }
      else if (this.startDate !== undefined && this.endDate !== undefined && Object.keys(timeSeriesQueries).length > 0) {
        onLoadQuery = parseTimeSeriesQuery(timeSeriesQueries[key], this.startDate, this.endDate)
      }
      else {
        onLoadQuery = queries[key]
      }
      let query = buildQuery(onLoadQuery, defaultLevel, this.levels, this.filters, this.startDate, this.endDate, key, this.compareDateRange);

      if (query && key === 'table') {
        this.getTableReportData(query, options);
      }
      else if (query && key === 'bigNumber') {
        this.getBigNumberReportData(query, options, 'averagePercentage');
      }
      else if (query && key === 'bigNumberComparison') {
        this.getBigNumberReportData(query, options, 'differencePercentage')
      }


    })
  }

  parseRbacFilter(query: string) {
    let newQuery = query;
    let startIndex = newQuery?.indexOf('{');
    let endIndex = newQuery?.indexOf('}');

    if (newQuery && startIndex > -1) {
      let propertyName = query.substring(startIndex + 1, endIndex);
      let re = new RegExp(`{${propertyName}}`, "g");
      Object.keys(this.rbacDetails).forEach((key: any) => {
        if (propertyName === key + '_id') {
          newQuery = newQuery.replace(re, '\'' + this.rbacDetails[key] + '\'');
        }
      });
    }
    return newQuery
  }

  filtersUpdated(filters: any): void {
    this.filters = filters;
    this.getReportData();
  }

  onSelectLevel(event: any): void {
    this.levels = event.items;
    this.getReportData();
  }

  timeSeriesUpdated(event: any): void {
    this.startDate = event?.startDate?.toDate().toISOString().split('T')[0]
    this.endDate = event?.endDate?.toDate().toISOString().split('T')[0]
    this.getReportData();
  }

  getTableReportData(query, options): void {
    this._commonService.getReportDataNew(query).subscribe((res: any) => {
      let rows = res;
      let { table: { columns } } = options;
      this.tableReportData = {
        data: rows.map(row => {
          if (this.minDate !== undefined && this.maxDate !== undefined) {
            if (row['min_date'] < this.minDate) {
              this.minDate = row['min_date']
            }
            if (row['max_date'] > this.maxDate) {
              this.maxDate = row['max_date']
            }
          }
          else {
            this.minDate = row['min_date']
            this.maxDate = row['max_date']
          }
          columns.forEach((col: any) => {
            if (row[col.property]) {
              row = {
                ...row,
                [col.property]: { value: row[col.property] }
              }
            }
          });
          return row
        }),
        columns: columns.filter(col => {
          if (rows[0] && col.property in rows[0]) {
            return col;
          }
        })
      }
    });
  }

  async getBigNumberReportData(query: string, options: any, indicator: string): Promise<void> {
    let { bigNumber } = options ?? {};
    let { valueSuffix } = bigNumber ?? {};
    if (indicator === 'averagePercentage') {
      this.bigNumberReportData = {
        ...this.bigNumberReportData,
        valueSuffix: valueSuffix
      }
      await this._commonService.getReportDataNew(query).subscribe((res: any) => {
        if (res) {
          let rows = res;
          this.bigNumberReportData = {
            ...this.bigNumberReportData,
            averagePercentage: rows[0].percentage
          }
        }
      })
    }
    else if (indicator === 'differencePercentage') {
      await this._commonService.getReportDataNew(query).subscribe((res: any) => {
        if (res) {
          let rows = res;
          this.bigNumberReportData = {
            ...this.bigNumberReportData,
            differencePercentage: rows[0].percentage
          }
          // this.bigNumberReport.emit(this.bigNumberReportData)
        }
      })
    }
    // console.log(rows)
  }

  getMapReportaData(query, options): void {

  }
}