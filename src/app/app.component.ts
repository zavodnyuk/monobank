import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import * as moment from 'moment';
import * as _ from 'lodash';

type AOA = any[][];
const DATE = 0;
const DETAIL = 1;
const SUM = 2;
const SUM_FEE = 3;
const CASHBAK = 4;
const CURRENT_AMOUNT = 5;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  readonly currentDate = moment();
  data: AOA; // = [[1, 2], [3, 4]];
  creditMoney = parseInt(sessionStorage.getItem('creditLimit'));
  firstDayUsingCredit = null; // String 'YYYY-MM-DD'
  maxDate = moment().format('YYYY-MM-DD'); // String 'YYYY-MM-DD'
  minDate = moment()
    .subtract(1, 'months')
    .date(1)
    .format('YYYY-MM-DD'); // String 'YYYY-MM-DD'
  allDatesAndSums: Array<{rawDate: string, date: any, currentAmount: number}> = [];
  allDatesAndDetailedSums: Array<{rawDate: string,
    date: any,
    currentAmount: number,
    owedSum: number,
    percentagePerDay: number,
    percentageSum: number
  }> = [];
  manualSetDate = false;
  errorMessage = null;

  setLimitToCookie() {
    sessionStorage.setItem('creditLimit', this.creditMoney.toString());
  }

  onFileChange(evt: any) {
    this.errorMessage = null;
    try {
      const target: DataTransfer = <DataTransfer>(evt.target);
      if (target.files.length !== 1) {
        throw new Error('Файл не выбран');
      }
      const reader: FileReader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const bstr: string = e.target.result;
          const wb: XLSX.WorkBook = XLSX.read(bstr, {type: 'binary'});
          const wsname: string = wb.SheetNames[0];
          const ws: XLSX.WorkSheet = wb.Sheets[wsname];
          this.data = <AOA>(XLSX.utils.sheet_to_json(ws, {header: 1}));

          if (!this.data) {
            throw Error('Невозможно собрать данные из файла. Возможно он пуст');
          }
          if (this.data[0].length !== 6) {
            throw new Error('Структура файла изменилась. Или файл неправильный файл');
          }

          this.updateFirstDayUsingCredit();

          this.performCounts();
        } catch (err) {
          this.errorMessage = err.message
          console.error(err);
        }
      };
      reader.readAsBinaryString(target.files[0]);
    } catch (err) {
      this.errorMessage = err.message
      console.error(err);
    }
  }

  updateFirstDayUsingCredit() {
    const firstDayPrevMonth = moment()
      .subtract(1, 'months')
      .date(1)
      .format('YYYY-MM-DD');
    if (moment(_.last(this.data)[DATE], 'DD.MM.YYYY').isAfter(firstDayPrevMonth)) {
      this.firstDayUsingCredit = moment(_.last(this.data)[DATE], 'DD.MM.YYYY').format('YYYY-MM-DD');
    } else {
      this.firstDayUsingCredit = firstDayPrevMonth;
    }
  }

  performCounts() {
    try {
      this.allDatesAndSums = this.data.map(row => {
        return {rawDate: row[DATE], date: moment(row[DATE], 'DD.MM.yyyy'), currentAmount: parseFloat(row[CURRENT_AMOUNT])};
      });

      this.allDatesAndSums.shift(); // deleting title
      this.findInitSum();
      this.sliceDataForPeriod();
      const fixedAllDatesAndSums = this.fixAmountForDayStarting(this.allDatesAndSums);
      const uniqDates = _.uniqBy(fixedAllDatesAndSums, 'rawDate').map(item => item.rawDate); // only dates where you used card

      let allDatesWithMinimumSums = [];

      uniqDates.forEach(uniqDate => {
        const singleDateAndSums = fixedAllDatesAndSums.filter(item => item.rawDate === uniqDate);
        allDatesWithMinimumSums.push(_.minBy(singleDateAndSums, 'currentAmount'));
      });
      this.countPercents(this.creditMoney, allDatesWithMinimumSums);
      return allDatesWithMinimumSums;
    } catch (err) {
      this.errorMessage = err.message;
      console.error(err);
    }
  }

  onDateChange(event) {
    if (event) {
      this.firstDayUsingCredit = event.target.value;
      this.manualSetDate = true;
      this.performCounts();
    }
  }

  sliceDataForPeriod() {
    const date = moment(this.firstDayUsingCredit, 'YYYY-MM-DD')
      // .subtract(1, 'day')
      .format('DD.MM.YYYY');
    const i = _.findLastIndex(this.allDatesAndSums, item => date === item.rawDate);
    const startDateIndex = i > 0 ? i : this.allDatesAndSums.length;
    this.allDatesAndSums = this.allDatesAndSums.slice(0, startDateIndex + 1);
    console.log('sliced', this.allDatesAndSums);
  }

  countPercents(startSum: number, allDatesAndMinSums: Array<{rawDate: string, date: any, currentAmount: number}>) {
    let newAllDatesAndMinSums: Array<{rawDate: string,
                                      date: any,
                                      currentAmount: number,
                                      owedSum: number,
                                      percentagePerDay: number,
                                      percentageSum: number
    }> = [];
    allDatesAndMinSums.forEach((item, i) => {
      newAllDatesAndMinSums.push(Object.assign(item, {
        owedSum: startSum - item.currentAmount,
        percentagePerDay: (startSum - item.currentAmount) * 3.2 * 12 / 365 / 100,
        percentageSum: null
      }));
    });
    newAllDatesAndMinSums.reverse().map((item, index) => {
      item.percentageSum = index !== 0 ? item.percentagePerDay + newAllDatesAndMinSums[index - 1].percentageSum : item.percentagePerDay;
      return item;
    });
    newAllDatesAndMinSums.reverse();
    console.log(newAllDatesAndMinSums);
    this.allDatesAndDetailedSums = newAllDatesAndMinSums;
}

  findInitSum() {
    if (moment(_.last(this.allDatesAndSums).rawDate, 'DD.MM.YYYY').isSame(moment(this.firstDayUsingCredit, 'YYYY-MM-DD'))) { // if date equal with choosen (and auto)
      return true;
    } else if (moment(_.last(this.allDatesAndSums).rawDate, 'DD.MM.YYYY').isAfter(moment(this.firstDayUsingCredit, 'YYYY-MM-DD')) // if transaction after owed day
    ) {
      if (!this.manualSetDate) { // but auto, set date to last in list
        this.firstDayUsingCredit = moment(_.last(this.allDatesAndSums).rawDate, 'DD.MM.YYYY').format('YYYY-MM-DD');
      } else {
        throw new Error('Дата первой транзакции отсутсвует в таблице и не совпадает с первым днем использования кредных средств,' +
          ' невозможно отследить начало');
      }
    } else if (moment(_.last(this.allDatesAndSums).rawDate, 'DD.MM.YYYY').isBefore(moment(this.firstDayUsingCredit, 'YYYY-MM-DD'))) {
      this.allDatesAndSums.forEach((item, index) => {
        if (moment(item.rawDate, 'DD.MM.YYYY').isBefore(moment(this.firstDayUsingCredit, 'YYYY-MM-DD'))) {
          this.allDatesAndSums.splice(index, 0, {
            rawDate: moment(this.firstDayUsingCredit, 'YYYY-MM-DD').format('DD.MM.YYYY'),
            date: moment(this.firstDayUsingCredit, 'YYYY-MM-DD'),
            currentAmount: item.currentAmount,
          });
        }
      });
    }
  }

  fixAmountForDayStarting(allDatesAndSums: Array<{rawDate: string, date: any, currentAmount: number}>) {
    let newAllDatesAndSums: Array<{rawDate: string, date: any, currentAmount: number}> = [];
    let currentDate = allDatesAndSums[0].rawDate;
    for (let i = 0; i < allDatesAndSums.length; i++) {
      if (allDatesAndSums[i].rawDate === currentDate) {
        newAllDatesAndSums.push(allDatesAndSums[i]);
      } else {
        newAllDatesAndSums.push({
          rawDate: allDatesAndSums[i - 1].rawDate,
          date: allDatesAndSums[i - 1].date,
          currentAmount: allDatesAndSums[i].currentAmount
        });
        newAllDatesAndSums.push(allDatesAndSums[i]);
        currentDate = allDatesAndSums[i].rawDate;
      }
    }
    return this.fillDatesWhenHaventUseCard(newAllDatesAndSums);
  }

  fillDatesWhenHaventUseCard(allDatesAndSums: Array<{rawDate: string, date: any, currentAmount: number}>) {
    let newAllDatesAndSums: Array<{ rawDate: string, date: any, currentAmount: number }> = [];
    let lastDayOfYearInDocument = allDatesAndSums[0].date.dayOfYear();
    if (lastDayOfYearInDocument !== moment().dayOfYear()) {
      let daysBetween: number = moment().dayOfYear() - lastDayOfYearInDocument - 1;
      newAllDatesAndSums.push({
        rawDate: moment().format('DD.MM.YYYY'),
        date: moment(),
        currentAmount: allDatesAndSums[0].currentAmount
      });
      for (let k = 0; k < daysBetween; k++) {
        newAllDatesAndSums.push({
          rawDate: newAllDatesAndSums[newAllDatesAndSums.length - 1].date.subtract(1, 'day').format('DD.MM.YYYY'),
          date: moment(newAllDatesAndSums[newAllDatesAndSums.length - 1].rawDate, 'DD.MM.YYYY').subtract(1, 'day'),
          currentAmount: allDatesAndSums[0].currentAmount
        });
      }
    }
    for (let i = 0; i < allDatesAndSums.length; i++) {
      if (lastDayOfYearInDocument !== allDatesAndSums[i].date.dayOfYear()) {
        let daysBetween: number = lastDayOfYearInDocument - allDatesAndSums[i].date.dayOfYear() - 1;
        for (let k = 0; k < daysBetween; k++) {
          newAllDatesAndSums.push({
            rawDate: newAllDatesAndSums[newAllDatesAndSums.length - 1].date.subtract(1, 'day').format('DD.MM.YYYY'),
            date: moment(newAllDatesAndSums[newAllDatesAndSums.length - 1].rawDate, 'DD.MM.YYYY').subtract(1, 'day'),
            currentAmount: allDatesAndSums[i].currentAmount
          });
        }
        lastDayOfYearInDocument = allDatesAndSums[i].date.dayOfYear();
        newAllDatesAndSums.push(allDatesAndSums[i]);
      } else {
        newAllDatesAndSums.push(allDatesAndSums[i]);
      }
    }
    return newAllDatesAndSums;
  }
}
