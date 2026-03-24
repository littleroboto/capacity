This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: src/**/*.ts, src/**/*.js, README.md, package.json
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  calendar/
    CalendarPainter.ts
    DomainCollection.ts
    Navigator.ts
    Populator.ts
  domain/
    DomainCoordinates.ts
    DomainLabelPainter.ts
    DomainPainter.ts
    DomainsContainerPainter.ts
  helpers/
    DateHelper.ts
    PositionHelper.ts
    ScaleHelper.ts
  options/
    Options.ts
    OptionsPreProcessors.ts
    OptionsValidator.ts
  plugins/
    PluginManager.ts
    PluginPainter.ts
  subDomain/
    SubDomainPainter.ts
  templates/
    day.ts
    ghDay.ts
    hour.ts
    index.ts
    minute.ts
    month.ts
    week.ts
    xDay.ts
    year.ts
  CalHeatmap.ts
  constants.ts
  DataFetcher.ts
  index.ts
  TemplateCollection.ts
  types.d.ts
  version.ts
package.json
README.md
```

# Files

## File: src/calendar/CalendarPainter.ts
```typescript
import { select } from 'd3-selection';

import DomainsContainerPainter from '../domain/DomainsContainerPainter';
import PluginPainter from '../plugins/PluginPainter';
import {
  ScrollDirection,
  CALENDAR_CONTAINER_SELECTOR,
} from '../constants';

import type CalHeatmap from '../CalHeatmap';
import type { Dimensions } from '../types';

export default class CalendarPainter {
  calendar: CalHeatmap;

  dimensions: Dimensions;

  root: any;

  domainsContainerPainter: DomainsContainerPainter;

  pluginPainter: PluginPainter;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
    this.dimensions = {
      width: 0,
      height: 0,
    };
    this.root = null;
    this.domainsContainerPainter = new DomainsContainerPainter(calendar);
    this.pluginPainter = new PluginPainter(calendar);
  }

  setup(): boolean {
    const { itemSelector, theme } = this.calendar.options.options;

    if (!this.root) {
      this.root = select(itemSelector)
        .append('svg')
        .attr('data-theme', theme)
        .attr('class', CALENDAR_CONTAINER_SELECTOR.slice(1));
      this.domainsContainerPainter.setup();
    }

    this.calendar.pluginManager.setupAll();

    return true;
  }

  paint(navigationDir: ScrollDirection = ScrollDirection.SCROLL_NONE) {
    const transitions = this.domainsContainerPainter
      .paint(navigationDir)
      .concat(this.pluginPainter.paint())
      .concat(this.domainsContainerPainter.updatePosition());

    this.#resize();

    return Promise.allSettled(transitions);
  }

  #getHeight(): Dimensions['height'] {
    return (
      this.domainsContainerPainter.height() + this.pluginPainter.insideHeight()
    );
  }

  #getWidth(): Dimensions['width'] {
    return (
      this.domainsContainerPainter.width() + this.pluginPainter.insideWidth()
    );
  }

  #resize(): void {
    const { options } = this.calendar.options;

    const newWidth = this.#getWidth();
    const newHeight = this.#getHeight();

    this.root
      .transition()
      .duration(options.animationDuration)
      .attr('width', newWidth)
      .attr('height', newHeight);

    if (
      newWidth !== this.dimensions.width ||
      newHeight !== this.dimensions.height
    ) {
      this.calendar.eventEmitter.emit(
        'resize',
        newWidth,
        newHeight,
        this.dimensions.width,
        this.dimensions.height,
      );
    }

    this.dimensions = {
      width: newWidth,
      height: newHeight,
    };
  }

  destroy(): Promise<unknown> {
    const result: Promise<unknown>[] = this.calendar.pluginManager
      .destroyAll()
      .concat(this.domainsContainerPainter.destroy());

    if (!this.root) {
      return Promise.allSettled(result);
    }

    result.push(
      this.root
        .transition()
        .duration(this.calendar.options.options.animationDuration)
        .attr('width', 0)
        .attr('height', 0)
        .remove()
        .end(),
    );

    return Promise.allSettled(result);
  }
}
```

## File: src/calendar/DomainCollection.ts
```typescript
import castArray from 'lodash-es/castArray';

import type { SubDomain, DomainType, Timestamp } from '../types';
import type {
  DataOptions,
  DataGroupType,
  DataRecord,
} from '../options/Options';
import type DateHelper from '../helpers/DateHelper';

export const DOMAIN_FORMAT: Record<DomainType, string> = {
  year: 'YYYY',
  month: 'MMMM',
  week: 'wo [week] YYYY',
  xDay: 'Do MMM',
  ghDay: 'Do MMM',
  day: 'Do MMM',
  hour: 'HH:00',
  minute: 'HH:mm',
};

type GroupedRecords = Map<Timestamp, { [key: Timestamp]: DataRecord[] }>;
type ValueType = string | number | null;

export default class DomainCollection {
  collection: Map<Timestamp, SubDomain[]>;

  dateHelper: DateHelper;

  min: Timestamp;

  max: Timestamp;

  keys: Timestamp[];

  yankedDomains: Timestamp[];

  constructor(
    dateHelper: DateHelper,
    interval?: DomainType,
    start?: Date | Timestamp,
    range?: Date | Timestamp,
    excludeEnd: boolean = false,
  ) {
    this.collection = new Map();
    this.dateHelper = dateHelper;

    if (interval && start && range) {
      const ts = this.dateHelper
        .intervals(interval, start, range, excludeEnd)
        .map((d: Timestamp) => castArray(d));

      // @ts-ignore
      this.collection = new Map(ts);
    }

    this.min = 0;
    this.max = 0;
    this.keys = [];
    this.yankedDomains = [];

    if (this.collection.size > 0) {
      this.#refreshKeys();
    }
  }

  has(key: Timestamp): boolean {
    return this.collection.has(key);
  }

  get(key: Timestamp) {
    return this.collection.get(key);
  }

  forEach(callback: any) {
    return this.collection.forEach(callback);
  }

  at(index: number): Timestamp {
    return this.keys[index];
  }

  clamp(minDate?: Timestamp, maxDate?: Timestamp): DomainCollection {
    if (minDate && this.min! < minDate) {
      this.keys
        .filter((key) => key < minDate)
        .forEach((d) => this.collection.delete(d));
    }

    if (maxDate && this.max! > maxDate) {
      this.keys
        .filter((key) => key > maxDate)
        .forEach((d) => this.collection.delete(d));
    }

    this.#refreshKeys();

    return this;
  }

  merge(
    newCollection: DomainCollection,
    limit: number,
    createValueCallback: Function,
  ): void {
    this.yankedDomains = [];

    newCollection.keys.forEach((domainKey, index) => {
      if (this.has(domainKey)) {
        return;
      }

      if (this.collection.size >= limit) {
        let keyToRemove = this.max;

        if (domainKey > this.max!) {
          keyToRemove = this.min;
        }

        if (keyToRemove && this.collection.delete(keyToRemove)) {
          this.yankedDomains.push(keyToRemove);
        }
      }
      this.collection.set(domainKey, createValueCallback(domainKey, index));
      this.#refreshKeys();
    });
    this.yankedDomains.sort((a, b) => a - b);
  }

  slice(limit: number = 0, fromBeginning: boolean = true): DomainCollection {
    if (this.keys.length > limit) {
      const keysToDelete = fromBeginning ?
        this.keys.slice(0, -limit) :
        this.keys.slice(limit);

      keysToDelete.forEach((key) => {
        this.collection.delete(key);
      });

      this.#refreshKeys();
    }

    return this;
  }

  fill(
    data: DataRecord[],
    {
      x,
      y,
      groupY,
      defaultValue,
    }: {
      x: DataOptions['x'];
      y: DataOptions['y'];
      groupY: DataOptions['groupY'];
      defaultValue: DataOptions['defaultValue'];
    },
    subDomainKeyExtractor: Function,
  ): void {
    const groupedRecords: GroupedRecords = this.groupRecords(
      data,
      x,
      subDomainKeyExtractor,
    );

    this.keys.forEach((domainKey) => {
      const records = groupedRecords.get(domainKey) ?? {};
      this.#setSubDomainValues(domainKey, records, y, groupY, defaultValue);
    });
  }

  #setSubDomainValues(
    domainKey: Timestamp,
    records: { [key: string]: DataRecord[] },
    y: DataOptions['y'],
    groupY: DataOptions['groupY'],
    defaultValue: DataOptions['defaultValue'],
  ): void {
    this.get(domainKey)!.forEach((subDomain: SubDomain, index: number) => {
      let value: ValueType = defaultValue;
      if (records.hasOwnProperty(subDomain.t)) {
        value = this.groupValues(
          this.#extractValues(records[subDomain.t], y),
          groupY,
        );
      }

      this.get(domainKey)![index].v = value;
    });
  }

  groupRecords(
    data: DataRecord[],
    x: DataOptions['x'],
    subDomainKeyExtractor: Function,
  ): GroupedRecords {
    const results: GroupedRecords = new Map();
    const validSubDomainTimestamp: Map<Timestamp, Timestamp> = new Map();
    this.keys.forEach((domainKey) => {
      this.get(domainKey)!.forEach((subDomain: SubDomain) => {
        validSubDomainTimestamp.set(subDomain.t, domainKey);
      });
    });

    data.forEach((d) => {
      const timestamp = this.extractTimestamp(d, x, subDomainKeyExtractor);

      if (validSubDomainTimestamp.has(timestamp)) {
        const domainKey = validSubDomainTimestamp.get(timestamp)!;
        const records = results.get(domainKey) ?? {};
        records[timestamp] ||= [];
        records[timestamp].push(d);

        results.set(domainKey, records);
      }
    });

    return results;
  }

  // eslint-disable-next-line class-methods-use-this
  #extractValues(data: DataRecord[], y: string | Function): ValueType[] {
    return data.map((d): ValueType => (typeof y === 'function' ? y(d) : d[y]));
  }

  // eslint-disable-next-line class-methods-use-this
  groupValues(
    values: ValueType[],
    groupFn: DataGroupType | ((values: ValueType[]) => ValueType),
  ): ValueType {
    const cleanedValues = values.filter((n) => n !== null);

    if (typeof groupFn === 'string') {
      if (cleanedValues.every((n) => typeof n === 'number')) {
        switch (groupFn) {
          case 'sum':
            return (cleanedValues as number[]).reduce((a, b) => a + b, 0);
          case 'count':
            return cleanedValues.length;
          case 'min':
            return Math.min(...(cleanedValues as number[])) || null;
          case 'max':
            return Math.max(...(cleanedValues as number[])) || null;
          case 'average':
            return cleanedValues.length > 0 ?
              (cleanedValues as number[]).reduce((a, b) => a + b, 0) /
                  cleanedValues.length :
              null;
          default:
            return null;
        }
      }

      if (groupFn === 'count') {
        return cleanedValues.length;
      }
      return null;
    }

    if (typeof groupFn === 'function') {
      return groupFn(cleanedValues);
    }

    return null;
  }

  // eslint-disable-next-line class-methods-use-this
  extractTimestamp(
    datum: DataRecord,
    x: string | Function,
    extractorFn: Function,
  ): Timestamp {
    let timestamp: string | Timestamp =
      typeof x === 'function' ? x(datum) : datum[x];

    if (typeof timestamp === 'string') {
      timestamp = +new Date(timestamp);
    }

    return extractorFn(timestamp);
  }

  #refreshKeys(): Timestamp[] {
    this.keys = Array.from(this.collection.keys())
      .map((d: any) => parseInt(d, 10))
      .sort((a, b) => a - b);

    const { keys } = this;
    // eslint-disable-next-line prefer-destructuring
    this.min = keys[0];
    this.max = keys[keys.length - 1];

    return this.keys;
  }
}
```

## File: src/calendar/Navigator.ts
```typescript
import { ScrollDirection } from '../constants';

import type CalHeatmap from '../CalHeatmap';
import type DomainCollection from './DomainCollection';
import type { Timestamp } from '../types';

export default class Navigator {
  calendar: CalHeatmap;

  minDomainReached: boolean;

  maxDomainReached: boolean;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
    this.maxDomainReached = false;
    this.minDomainReached = false;
  }

  loadNewDomains(
    newDomainCollection: DomainCollection,
    direction: ScrollDirection = ScrollDirection.SCROLL_NONE,
  ): ScrollDirection {
    const { options } = this.calendar.options;
    const templatesClt = this.calendar.templateCollection;
    const minDate = options.date.min ?
      templatesClt.get(options.domain.type)!.extractUnit(+options.date.min) :
      undefined;
    const maxDate = options.date.max ?
      templatesClt.get(options.domain.type)!.extractUnit(+options.date.max) :
      undefined;
    const { domainCollection } = this.calendar;

    if (
      this.#isDomainBoundaryReached(
        newDomainCollection,
        minDate,
        maxDate,
        direction,
      )
    ) {
      return ScrollDirection.SCROLL_NONE;
    }

    if (direction !== ScrollDirection.SCROLL_NONE) {
      newDomainCollection
        .clamp(minDate, maxDate)
        .slice(options.range, direction === ScrollDirection.SCROLL_FORWARD);
    }

    domainCollection.merge(
      newDomainCollection,
      options.range,
      (domainKey: Timestamp, index: number) => {
        let subDomainEndDate = null;
        if (newDomainCollection.at(index + 1)) {
          subDomainEndDate = newDomainCollection.at(index + 1);
        } else {
          subDomainEndDate = this.calendar.dateHelper
            .intervals(options.domain.type, domainKey, 2)
            .pop();
        }
        return templatesClt
          .get(options.subDomain.type)!
          .mapping(domainKey, subDomainEndDate!)
          .map((d) => ({ ...d, v: options.data.defaultValue }));
      },
    );

    this.#setDomainsBoundaryReached(
      domainCollection.min,
      domainCollection.max,
      minDate,
      maxDate,
    );

    if (direction === ScrollDirection.SCROLL_BACKWARD) {
      this.calendar.eventEmitter.emit('domainsLoaded', [domainCollection.min]);
    } else if (direction === ScrollDirection.SCROLL_FORWARD) {
      this.calendar.eventEmitter.emit('domainsLoaded', [domainCollection.max]);
    }

    return direction;
  }

  jumpTo(date: Date, reset: boolean): ScrollDirection {
    const { domainCollection, options } = this.calendar;
    const minDate = new Date(domainCollection.min!);
    const maxDate = new Date(domainCollection.max!);

    if (date < minDate) {
      return this.loadNewDomains(
        this.calendar.createDomainCollection(date, minDate, false),
        ScrollDirection.SCROLL_BACKWARD,
      );
    }
    if (reset) {
      return this.loadNewDomains(
        this.calendar.createDomainCollection(date, options.options.range),
        minDate < date ?
          ScrollDirection.SCROLL_FORWARD :
          ScrollDirection.SCROLL_BACKWARD,
      );
    }

    if (date > maxDate) {
      return this.loadNewDomains(
        this.calendar.createDomainCollection(maxDate, date, false),
        ScrollDirection.SCROLL_FORWARD,
      );
    }

    return ScrollDirection.SCROLL_NONE;
  }

  #isDomainBoundaryReached(
    newDomainCollection: DomainCollection,
    minDate?: Timestamp,
    maxDate?: Timestamp,
    direction?: ScrollDirection,
  ): boolean {
    if (
      maxDate &&
      newDomainCollection.max! >= maxDate &&
      this.maxDomainReached &&
      direction === ScrollDirection.SCROLL_FORWARD
    ) {
      return true;
    }

    if (
      minDate &&
      newDomainCollection.min! <= minDate &&
      this.minDomainReached &&
      direction === ScrollDirection.SCROLL_BACKWARD
    ) {
      return true;
    }

    return false;
  }

  #setDomainsBoundaryReached(
    lowerBound: Timestamp,
    upperBound: Timestamp,
    min?: Timestamp,
    max?: Timestamp,
  ): void {
    if (min) {
      const reached = lowerBound <= min;
      this.calendar.eventEmitter.emit(
        reached ? 'minDateReached' : 'minDateNotReached',
      );
      this.minDomainReached = reached;
    }
    if (max) {
      const reached = upperBound >= max;
      this.calendar.eventEmitter.emit(
        reached ? 'maxDateReached' : 'maxDateNotReached',
      );
      this.maxDomainReached = reached;
    }
  }
}
```

## File: src/calendar/Populator.ts
```typescript
import isFunction from 'lodash-es/isFunction';
import { hcl } from 'd3-color';
import { normalizedScale, applyScaleStyle } from '../helpers/ScaleHelper';

import type CalHeatmap from '../CalHeatmap';
import type { SubDomain, Timestamp } from '../types';

export default class Populator {
  calendar: CalHeatmap;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
  }

  populate(): void {
    const { calendar } = this;
    const { scale, subDomain } = calendar.options.options;
    const colorScale = normalizedScale(scale);

    calendar.calendarPainter
      .root!.selectAll('.ch-domain')
      .selectAll('svg')
      .selectAll('g')
      .data((d: Timestamp) => calendar.domainCollection.get(d) || [])
      .call((element: any) => {
        applyScaleStyle(element.select('rect'), colorScale, scale!, 'v');
      })
      .call((element: any) => {
        element
          .select('text')
          .attr('style', (d: SubDomain) => {
            const defaultColor =
              hcl(colorScale?.apply(d.v)).l > 60 ? '#000' : '#fff';
            let color = subDomain.color || (d.v ? defaultColor : null);

            if (isFunction(color)) {
              color = color(d.t, d.v, colorScale?.apply(d.v));
            }

            if (!color) {
              return null;
            }

            return `fill: ${color};`;
          })
          .text((d: SubDomain, i: number, nodes: any[]) =>
            // eslint-disable-next-line implicit-arrow-linebreak
            calendar.dateHelper.format(d.t, subDomain.label, d.v, nodes[i]));
      })
      .call(() => {
        calendar.eventEmitter.emit('fill');
      });
  }
}
```

## File: src/domain/DomainCoordinates.ts
```typescript
import { ScrollDirection } from '../constants';
import { horizontalPadding, verticalPadding } from '../helpers/PositionHelper';

import type CalHeatmap from '../CalHeatmap';
import type DomainPainter from './DomainPainter';
import type DomainCollection from '../calendar/DomainCollection';
import type { SubDomain, Dimensions, Timestamp } from '../types';

type SubDomainWithCoordinates = Required<SubDomain> & {
  pre_x: number;
  pre_y: number;
  width: number;
  height: number;
  inner_width: number;
  inner_height: number;
};

export default class DomainCoordinates {
  calendar: CalHeatmap;

  domainPainter: DomainPainter;

  collection: Map<Timestamp, SubDomainWithCoordinates>;

  scrollDirection: ScrollDirection;

  constructor(calendar: CalHeatmap, domainPainter: DomainPainter) {
    this.calendar = calendar;
    this.domainPainter = domainPainter;
    this.collection = new Map();
    this.scrollDirection = ScrollDirection.SCROLL_FORWARD;
  }

  get(domainKey: Timestamp): SubDomainWithCoordinates | undefined {
    return this.collection.get(domainKey);
  }

  update(collection: DomainCollection, scrollDirection: ScrollDirection) {
    const { verticalOrientation, domain } = this.calendar.options.options;

    this.scrollDirection = scrollDirection;
    const dimensions: Dimensions = {
      width: 0,
      height: 0,
    };
    let exitingTotal = 0;
    let scrollFactor =
      scrollDirection === ScrollDirection.SCROLL_FORWARD ? -1 : 1;
    const { keys } = collection;
    if (this.calendar.options.options.domain.sort === 'desc') {
      keys.reverse();
      scrollFactor *= -1;
    }

    collection.yankedDomains.forEach((domainKey: Timestamp) => {
      exitingTotal +=
        this.collection.get(domainKey)![
          verticalOrientation ? 'height' : 'width'
        ];
    });
    collection.yankedDomains.forEach((domainKey: Timestamp) => {
      const coor = this.collection.get(domainKey)!;
      this.collection.set(domainKey, {
        ...coor,
        x: verticalOrientation ? coor.x : coor.x + exitingTotal * scrollFactor,
        y: verticalOrientation ? coor.y + exitingTotal * scrollFactor : coor.y,
      });
    });

    keys.forEach((domainKey: Timestamp) => {
      const w = this.#getWidth(domainKey);
      const h = this.#getHeight(domainKey);
      if (verticalOrientation) {
        dimensions.height += h;
        dimensions.width = Math.max(w, dimensions.width);
      } else {
        dimensions.width += w;
        dimensions.height = Math.max(h, dimensions.height);
      }

      const x = dimensions.width - w;
      const y = dimensions.height - h;

      this.collection.set(domainKey, {
        ...this.collection.get(domainKey)!,
        x: verticalOrientation ? 0 : x,
        y: verticalOrientation ? y : 0,
        pre_x: verticalOrientation ? x : x - exitingTotal * scrollFactor,
        pre_y: verticalOrientation ? y - exitingTotal * scrollFactor : y,
        width: w,
        height: h,
        inner_width: w - (verticalOrientation ? 0 : domain.gutter),
        inner_height: h - (!verticalOrientation ? 0 : domain.gutter),
      });
    });

    return dimensions;
  }

  /**
   * Return the full width of the domain block
   * @param {number} d Domain start timestamp
   * @return {number} The full width of the domain,
   * including all padding and gutter
   * Used to compute the x position of the domains on the x axis
   */
  #getWidth(d: Timestamp): number {
    const {
      domain, subDomain, x, verticalOrientation,
    } =
      this.calendar.options.options;
    const columnsCount = this.calendar.templateCollection
      .get(subDomain.type)!
      .columnsCount(d);

    const subDomainWidth =
      (subDomain.width + subDomain.gutter) * columnsCount - subDomain.gutter;

    return (
      horizontalPadding(domain.padding) +
      x.domainHorizontalLabelWidth +
      (verticalOrientation ? 0 : domain.gutter) +
      subDomainWidth
    );
  }

  /**
   * Return the full height of the domain block
   * @param {number} d Domain start timestamp
   * @return {number} The full height of the domain,
   * including all paddings and gutter.
   * Used to compute the y position of the domains on the y axis
   */
  #getHeight(d: Timestamp): number {
    const {
      domain, subDomain, x, verticalOrientation,
    } =
      this.calendar.options.options;
    const rowsCount = this.calendar.templateCollection
      .get(subDomain.type)!
      .rowsCount(d);

    const subDomainHeight =
      (subDomain.height + subDomain.gutter) * rowsCount - subDomain.gutter;

    return (
      verticalPadding(domain.padding) +
      subDomainHeight +
      (verticalOrientation ? domain.gutter : 0) +
      x.domainVerticalLabelHeight
    );
  }
}
```

## File: src/domain/DomainLabelPainter.ts
```typescript
import { Position, DOMAIN_LABEL_SELECTOR } from '../constants';
import {
  isVertical,
  verticalPadding,
  horizontalPadding,
} from '../helpers/PositionHelper';
import { DOMAIN_FORMAT } from '../calendar/DomainCollection';

import type CalHeatmap from '../CalHeatmap';
import type { Timestamp } from '../types';

export default class DomainLabelPainter {
  calendar: CalHeatmap;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
  }

  paint(root: any): void {
    const { label, type } = this.calendar.options.options.domain;
    const { dateHelper } = this.calendar;
    let format = label.text;
    if (format === null || format === '') {
      return;
    }

    if (typeof format === 'undefined') {
      format = DOMAIN_FORMAT[type];
    }

    root
      .selectAll(DOMAIN_LABEL_SELECTOR)
      .data(
        (d: Timestamp) => [d],
        (d: Timestamp) => d,
      )
      .join(
        (enter: any) => enter
          .append('text')
          .attr('class', DOMAIN_LABEL_SELECTOR.slice(1))
          .attr('x', (d: Timestamp) => this.#getX(d))
          .attr('y', (d: Timestamp) => this.#getY(d))
          .attr('text-anchor', label.textAlign)
          .attr('dominant-baseline', () => this.#textVerticalAlign())
          .text((d: Timestamp, i: number, nodes: any[]) =>
          // eslint-disable-next-line implicit-arrow-linebreak
            dateHelper.format(d, format!, nodes[i]))
          .call((selection: any) => this.#domainRotate(selection)),
        (update: any) => {
          update
            .attr('x', (d: Timestamp) => this.#getX(d))
            .attr('y', (d: Timestamp) => this.#getY(d))
            .attr('text-anchor', label.textAlign)
            .attr('dominant-baseline', () => this.#textVerticalAlign())
            .text((d: Timestamp, i: number, nodes: any[]) =>
              // eslint-disable-next-line implicit-arrow-linebreak
              dateHelper.format(d, format!, nodes[i]))
            .call((selection: any) => this.#domainRotate(selection));
        },
      );
  }

  #textVerticalAlign(): string {
    const { position, rotate } = this.calendar.options.options.domain.label;

    if (isVertical(position)) {
      return 'middle';
    }

    if (
      (rotate === 'left' && position === 'left') ||
      (rotate === 'right' && position === 'right')
    ) {
      return 'bottom';
    }

    return 'hanging';
  }

  #getX(d: Timestamp): number {
    const {
      padding,
      label: { position, textAlign, offset },
    } = this.calendar.options.options.domain;
    const { domainHorizontalLabelWidth } = this.calendar.options.options.x;

    let x = padding[Position.LEFT];

    if (position === 'right') {
      x += this.#getDomainInsideWidth(d);
    }

    if (textAlign === 'middle') {
      if (['top', 'bottom'].includes(position)) {
        x += this.#getDomainInsideWidth(d) / 2;
      } else {
        x += domainHorizontalLabelWidth / 2;
      }
    }

    if (textAlign === 'end') {
      if (isVertical(position)) {
        x += this.#getDomainInsideWidth(d);
      } else {
        x += domainHorizontalLabelWidth;
      }
    }

    return x + offset.x;
  }

  #getY(d: Timestamp): number {
    const {
      domain: {
        label: { position, offset },
        padding,
      },
      x,
    } = this.calendar.options.options;

    let y = padding[Position.TOP] + x.domainVerticalLabelHeight / 2;

    if (position === 'bottom') {
      y += this.#getDomainInsideHeight(d);
    }

    return y + offset.y;
  }

  #getDomainInsideWidth(d: Timestamp): number {
    const {
      domain: { padding },
      x: { domainHorizontalLabelWidth },
    } = this.calendar.options.options;
    const { coordinates } =
      this.calendar.calendarPainter.domainsContainerPainter.domainPainter;

    return (
      coordinates.get(d)!.inner_width -
      domainHorizontalLabelWidth -
      horizontalPadding(padding)
    );
  }

  #getDomainInsideHeight(d: Timestamp): number {
    const {
      x: { domainVerticalLabelHeight },
      domain: { padding },
    } = this.calendar.options.options;
    const { coordinates } =
      this.calendar.calendarPainter.domainsContainerPainter.domainPainter;

    return (
      coordinates.get(d)!.inner_height -
      domainVerticalLabelHeight -
      verticalPadding(padding)
    );
  }

  #domainRotate(selection: any) {
    const {
      domain: {
        label: { rotate, textAlign, position },
      },
      x,
    } = this.calendar.options.options;
    const labelWidth = x.domainHorizontalLabelWidth;

    switch (rotate) {
      // Rotating the text clockwise
      case 'right':
        selection.attr('transform', (d: Timestamp) => {
          const domainWidth = this.#getDomainInsideWidth(d);
          const domainHeight = this.#getDomainInsideHeight(d);
          const s = [
            `rotate(90, ${position === 'right' ? domainWidth : labelWidth}, 0)`,
          ];

          switch (position) {
            case 'right':
              if (textAlign === 'middle') {
                s.push(`translate(${domainHeight / 2 - labelWidth / 2})`);
              } else if (textAlign === 'end') {
                s.push(`translate(${domainHeight - labelWidth})`);
              }
              break;
            case 'left':
              if (textAlign === 'start') {
                s.push(`translate(${labelWidth})`);
              } else if (textAlign === 'middle') {
                s.push(`translate(${labelWidth / 2 + domainHeight / 2})`);
              } else if (textAlign === 'end') {
                s.push(`translate(${domainHeight})`);
              }
              break;
            default:
          }

          return s.join(',');
        });
        break;
      // Rotating the text anticlockwise
      case 'left':
        selection.attr('transform', (d: Timestamp) => {
          const domainWidth = this.#getDomainInsideWidth(d);
          const domainHeight = this.#getDomainInsideHeight(d);
          const s = [
            `rotate(270, ${
              position === 'right' ? domainWidth : labelWidth
            }, 0)`,
          ];

          switch (position) {
            case 'right':
              if (textAlign === 'start') {
                s.push(`translate(-${domainHeight})`);
              } else if (textAlign === 'middle') {
                s.push(`translate(-${domainHeight / 2 + labelWidth / 2})`);
              } else if (textAlign === 'end') {
                s.push(`translate(-${labelWidth})`);
              }
              break;
            case 'left':
              if (textAlign === 'start') {
                s.push(`translate(${labelWidth - domainHeight})`);
              } else if (textAlign === 'middle') {
                s.push(`translate(${labelWidth / 2 - domainHeight / 2})`);
              }
              break;
            default:
          }

          return s.join(',');
        });
        break;
      default:
    }
  }
}
```

## File: src/domain/DomainPainter.ts
```typescript
import DomainCoordinates from './DomainCoordinates';
import { ScrollDirection, DOMAIN_SELECTOR } from '../constants';

import type CalHeatmap from '../CalHeatmap';
import type { Dimensions, Timestamp } from '../types';

export default class DomainPainter {
  calendar: CalHeatmap;

  coordinates: DomainCoordinates;

  root: any;

  dimensions: Dimensions;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
    this.coordinates = new DomainCoordinates(calendar, this);
    this.root = null;

    // Dimensions of the internal area containing all the domains
    // Excluding all surrounding margins
    this.dimensions = {
      width: 0,
      height: 0,
    };
  }

  paint(scrollDirection: ScrollDirection, rootNode: any): Promise<unknown>[] {
    const { animationDuration } = this.calendar.options.options;
    const t = rootNode.transition().duration(animationDuration);
    const coor = this.coordinates;

    this.dimensions = coor.update(
      this.calendar.domainCollection,
      scrollDirection,
    );

    const promises: Promise<unknown>[] = [];

    this.root = rootNode
      .selectAll(DOMAIN_SELECTOR)
      .data(this.calendar.domainCollection.keys, (d: Timestamp) => d)
      .join(
        (enter: any) => enter
          .append('svg')
          .attr('x', (d: Timestamp) => coor.get(d)!.pre_x)
          .attr('y', (d: Timestamp) => coor.get(d)!.pre_y)
          .attr('width', (d: Timestamp) => coor.get(d)!.inner_width)
          .attr('height', (d: Timestamp) => coor.get(d)!.inner_height)
          .attr('class', (d: Timestamp) => this.#getClassName(d))
          .call((enterSelection: any) => enterSelection
            .append('rect')
            .attr('width', (d: Timestamp) => coor.get(d)!.inner_width)
            .attr('height', (d: Timestamp) => coor.get(d)!.inner_height)
            .attr('class', `${DOMAIN_SELECTOR.slice(1)}-bg`))
          .call((enterSelection: any) => promises.push(
            enterSelection
              .transition(t)
              .attr('x', (d: Timestamp) => coor.get(d)!.x)
              .attr('y', (d: Timestamp) => coor.get(d)!.y)
              .end(),
          )),
        (update: any) => update
          .call((updateSelection: any) => promises.push(
            updateSelection
              .transition(t)
              .attr('x', (d: Timestamp) => coor.get(d)!.x)
              .attr('y', (d: Timestamp) => coor.get(d)!.y)
              .attr('width', (d: Timestamp) => coor.get(d)!.inner_width)
              .attr('height', (d: Timestamp) => coor.get(d)!.inner_height)
              .end(),
          ))
          .call((updateSelection: any) => promises.push(
            updateSelection
              .selectAll(`${DOMAIN_SELECTOR}-bg`)
              .transition(t)
              .attr('width', (d: Timestamp) => coor.get(d)!.inner_width)
              .attr('height', (d: Timestamp) => coor.get(d)!.inner_height)
              .end(),
          )),
        (exit: any) => exit.call((exitSelection: any) => promises.push(
          exitSelection
            .transition(t)
            .attr('x', (d: Timestamp) => coor.get(d)!.x)
            .attr('y', (d: Timestamp) => coor.get(d)!.y)
            .remove()
            .end(),
        )),
      );

    return promises;
  }

  #getClassName(d: Timestamp): string {
    let classname = DOMAIN_SELECTOR.slice(1);
    const helper = this.calendar.dateHelper.date(d);

    switch (this.calendar.options.options.domain.type) {
      case 'hour':
        classname += ` h_${helper.hour()}`;
        break;
      case 'day':
        classname += ` d_${helper.date()} dy_${helper.format('d') + 1}`;
        break;
      case 'week':
        classname += ` w_${helper.week()}`;
        break;
      case 'month':
        classname += ` m_${helper.month() + 1}`;
        break;
      case 'year':
        classname += ` y_${helper.year()}`;
        break;
      default:
    }
    return classname;
  }
}
```

## File: src/domain/DomainsContainerPainter.ts
```typescript
import { select } from 'd3-selection';
import DomainPainter from './DomainPainter';
import DomainLabelPainter from './DomainLabelPainter';
import SubDomainPainter from '../subDomain/SubDomainPainter';
import { ScrollDirection } from '../constants';

import type CalHeatmap from '../CalHeatmap';
import type { Dimensions } from '../types';

const BASE_SELECTOR = '.ch-domain-container';
const TRANSITION_CLASSNAME = 'in-transition';

class DomainsContainerPainter {
  calendar: CalHeatmap;

  domainPainter: DomainPainter;

  domainLabelPainter: DomainLabelPainter;

  subDomainPainter: SubDomainPainter;

  dimensions: Dimensions;

  root: any;

  transitionsQueueCount: number;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;

    this.domainPainter = new DomainPainter(calendar);
    this.subDomainPainter = new SubDomainPainter(calendar);
    this.domainLabelPainter = new DomainLabelPainter(calendar);
    this.dimensions = {
      width: 0,
      height: 0,
    };
    this.transitionsQueueCount = 0;
  }

  setup() {
    this.root = this.calendar.calendarPainter.root
      .attr('x', 0)
      .attr('y', 0)
      .append('svg')
      .attr('class', BASE_SELECTOR.slice(1))
      .append('svg')
      .attr('class', `${BASE_SELECTOR.slice(1)}-animation-wrapper`);
  }

  paint(scrollDirection: ScrollDirection): Promise<unknown>[] {
    this.#startAnimation();

    const result = this.domainPainter.paint(scrollDirection, this.root);
    this.subDomainPainter.paint(this.domainPainter.root);
    this.domainLabelPainter.paint(this.domainPainter.root);

    this.#recomputeDimensions();

    Promise.allSettled(result).then(() => {
      this.#endAnimation();
    });

    return result;
  }

  updatePosition() {
    if (!this.root?.node()) {
      return Promise.resolve();
    }

    const { animationDuration } = this.calendar.options.options;
    const topHeight = this.calendar.pluginManager.getHeightFromPosition('top');
    const leftWidth = this.calendar.pluginManager.getWidthFromPosition('left');

    return [
      select(this.root.node().parentNode)
        .transition()
        .duration(animationDuration)
        .call((selection: any) => {
          selection.attr('x', leftWidth).attr('y', topHeight);
        })
        .end(),
    ];
  }

  width(): Dimensions['width'] {
    return this.dimensions.width;
  }

  height(): Dimensions['height'] {
    return this.dimensions.height;
  }

  destroy(): Promise<unknown> {
    this.#startAnimation();

    return Promise.resolve();
  }

  #startAnimation() {
    if (this.root?.node()) {
      this.transitionsQueueCount += 1;
      select(this.root.node().parentNode).classed(TRANSITION_CLASSNAME, true);
    }
  }

  #endAnimation() {
    if (this.root?.node()) {
      this.transitionsQueueCount -= 1;

      if (this.transitionsQueueCount === 0) {
        select(this.root.node().parentNode).classed(
          TRANSITION_CLASSNAME,
          false,
        );
      }
    }
  }

  #recomputeDimensions(): void {
    const {
      animationDuration,
      verticalOrientation,
      domain: { gutter },
    } = this.calendar.options.options;
    const { dimensions: domainsDimensions } = this.domainPainter;

    this.dimensions = {
      width: domainsDimensions.width - (verticalOrientation ? 0 : gutter),
      height: domainsDimensions.height - (!verticalOrientation ? 0 : gutter),
    };

    this.root
      .transition()
      .duration(animationDuration)
      .attr('width', this.dimensions.width)
      .attr('height', this.dimensions.height);
  }
}

export default DomainsContainerPainter;
```

## File: src/helpers/DateHelper.ts
```typescript
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import dayOfYear from 'dayjs/plugin/dayOfYear';
import weekday from 'dayjs/plugin/weekday';
import minMax from 'dayjs/plugin/minMax';
import isoWeeksInYear from 'dayjs/plugin/isoWeeksInYear';
import isoWeek from 'dayjs/plugin/isoWeek';
import isLeapYear from 'dayjs/plugin/isLeapYear';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import localeData from 'dayjs/plugin/localeData';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import updateLocale from 'dayjs/plugin/updateLocale';

import type { ManipulateType, PluginFunc, Ls } from 'dayjs';
import type { OptionsType } from '../options/Options';
import type { Timestamp, DomainType } from '../types';

dayjs.extend(weekOfYear);
dayjs.extend(isoWeeksInYear);
dayjs.extend(isoWeek);
dayjs.extend(isLeapYear);
dayjs.extend(dayOfYear);
dayjs.extend(weekday);
dayjs.extend(minMax);
dayjs.extend(advancedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localeData);
dayjs.extend(localizedFormat);
dayjs.extend(updateLocale);

const DEFAULT_LOCALE = 'en';

export default class DateHelper {
  locale: OptionsType['date']['locale'];

  timezone: string;

  constructor() {
    this.locale = DEFAULT_LOCALE;
    this.timezone = dayjs.tz.guess();
    if (typeof window === 'object') {
      (window as any).dayjs ||= dayjs;
    }
  }

  async setup({ options }: { options: OptionsType }) {
    this.timezone = options.date.timezone || dayjs.tz.guess();
    const userLocale = options.date.locale;

    if (typeof userLocale === 'string' && userLocale !== DEFAULT_LOCALE) {
      let locale;
      if (typeof window === 'object') {
        locale =
          (window as any)[`dayjs_locale_${userLocale}`] ||
          (await this.loadBrowserLocale(userLocale));
      } else {
        locale = await this.loadNodeLocale(userLocale);
      }
      dayjs.locale(userLocale);
      this.locale = locale;
    }

    if (typeof userLocale === 'object') {
      if (userLocale.hasOwnProperty('name')) {
        dayjs.locale(userLocale.name, userLocale);
        this.locale = userLocale;
      } else {
        this.locale = dayjs.updateLocale(DEFAULT_LOCALE, userLocale);
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  extend(dayjsPlugin: PluginFunc): dayjs.Dayjs {
    return dayjs.extend(dayjsPlugin);
  }

  /**
   * Return the week number, relative to its month
   *
   * @param  {number|Date} d Date or timestamp in milliseconds
   * @returns {number} The week number, relative to the month [0-5]
   */
  getMonthWeekNumber(d: Timestamp | dayjs.Dayjs): number {
    const dayjsDate = this.date(d);
    const date = dayjsDate.startOf('day');
    const endOfWeek = dayjsDate.startOf('month').endOf('week');

    if (date <= endOfWeek) {
      return 1;
    }
    return Math.ceil(date.diff(endOfWeek, 'weeks', true)) + 1;
  }

  /**
   * Return the number of weeks in the given month
   *
   * As there is no fixed standard to specify which month a partial week should
   * belongs to, the ISO week date standard is used, where:
   * - the first week of the month should have at least 4 days
   *
   *  @see https://en.wikipedia.org/wiki/ISO_week_date
   *
   * @param  {Timestamp | dayjs.Dayjs} d Datejs object or timestamp
   * @return {number}         The number of weeks
   */
  getWeeksCountInMonth(d: Timestamp | dayjs.Dayjs): number {
    const pivotDate = this.date(d);

    return (
      this.getLastWeekOfMonth(pivotDate).diff(
        this.getFirstWeekOfMonth(pivotDate),
        'week',
      ) + 1
    );
  }

  /**
   * Return the start of the first week of the month
   *
   * @see getWeeksCountInMonth() about standard warning
   * @return {dayjs.Dayjs} A dayjs object representing the start of the
   * first week
   */
  getFirstWeekOfMonth(d: Timestamp | dayjs.Dayjs): dayjs.Dayjs {
    const startOfMonth = this.date(d).startOf('month');
    let startOfFirstWeek = startOfMonth.startOf('week');
    if (startOfMonth.weekday() > 4) {
      startOfFirstWeek = startOfFirstWeek.add(1, 'week');
    }

    return startOfFirstWeek;
  }

  /**
   * Return the end of the last week of the month
   *
   * @see getWeeksCountInMonth() about standard warning
   * @return {dayjs.Dayjs} A dayjs object representing the end of the last week
   */
  getLastWeekOfMonth(d: Timestamp | dayjs.Dayjs): dayjs.Dayjs {
    const endOfMonth = this.date(d).endOf('month');
    let endOfLastWeek = endOfMonth.endOf('week');
    if (endOfMonth.weekday() < 4) {
      endOfLastWeek = endOfLastWeek.subtract(1, 'week');
    }

    return endOfLastWeek;
  }

  date(d: Timestamp | Date | dayjs.Dayjs | string = new Date()): dayjs.Dayjs {
    if (dayjs.isDayjs(d)) {
      return d;
    }

    return dayjs(d)
      .tz(this.timezone)
      .utcOffset(0)
      .locale(this.locale as (typeof Ls)[0] | string);
  }

  format(
    timestamp: Timestamp,
    formatter: null | string | Function,
    ...args: any
  ): string | null {
    if (typeof formatter === 'function') {
      return formatter(timestamp, ...args);
    }

    if (typeof formatter === 'string') {
      return this.date(timestamp).format(formatter);
    }

    return null;
  }

  /**
   * Return an array of time interval
   *
   * @param  {number|Date} date A random date included in the wanted interval
   * @param  {number|Date} range Length of the wanted interval, or a stop date.
   * @param  {boolean} range Whether the end date should be excluded
   *                         from the result
   * @returns {Array<number>} Array of unix timestamp, in milliseconds
   */
  intervals(
    interval: DomainType,
    date: Timestamp | Date | dayjs.Dayjs,
    range: number | Date | dayjs.Dayjs,
    excludeEnd: boolean = true,
  ): Timestamp[] {
    let start = this.date(date);
    let end: dayjs.Dayjs;
    if (typeof range === 'number') {
      end = start.add(range, interval as ManipulateType);
    } else if (dayjs.isDayjs(range)) {
      end = range;
    } else {
      end = this.date(range);
    }

    start = start.startOf(interval as ManipulateType);

    end = end.startOf(interval as ManipulateType);
    let pivot = dayjs.min(start, end)!;
    end = dayjs.max(start, end)!;
    const result: Timestamp[] = [];

    if (!excludeEnd) {
      end = end.add(1, 'second');
    }

    do {
      result.push(+pivot);
      pivot = pivot.add(1, interval as ManipulateType);
    } while (pivot < end);

    return result;
  }

  // this function will work cross-browser for loading scripts asynchronously
  // eslint-disable-next-line class-methods-use-this
  loadBrowserLocale(userLocale: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = `https://cdn.jsdelivr.net/npm/dayjs@1/locale/${userLocale}.js`;
      s.onerror = (err) => {
        reject(err);
      };
      s.onload = () => {
        resolve((window as any)[`dayjs_locale_${userLocale}`]);
      };
      document.head.appendChild(s);
    });
  }

  // eslint-disable-next-line class-methods-use-this
  loadNodeLocale(userLocale: string): Promise<any> {
    return import(`dayjs/locale/${userLocale}.js`);
  }
}
```

## File: src/helpers/PositionHelper.ts
```typescript
import { Position } from '../constants';
import type { Padding } from '../types';

export function isHorizontal(position: string): boolean {
  return position === 'left' || position === 'right';
}

export function isVertical(position: string): boolean {
  return position === 'top' || position === 'bottom';
}

export function horizontalPadding(padding: Padding): number {
  return padding[Position.LEFT] + padding[Position.RIGHT];
}

export function verticalPadding(padding: Padding): number {
  return padding[Position.TOP] + padding[Position.BOTTOM];
}
```

## File: src/helpers/ScaleHelper.ts
```typescript
// @ts-ignore
import { scale } from '@observablehq/plot';
import { OptionsType } from '../options/Options';
import { SCALE_BASE_OPACITY_COLOR } from '../constants';

import type { SubDomain } from '../types';

type ValueType = string | number | undefined;

export function normalizedScale(scaleOptions: OptionsType['scale']): any {
  try {
    const scaleType = Object.keys(scaleOptions!)[0];

    return scale({
      [scaleType]: {
        ...scaleOptions![scaleType as 'color' | 'opacity'],
        clamp: true,
      },
    });
  } catch (error) {
    return null;
  }
}

function scaleStyle(_scale: any, scaleOptions: OptionsType['scale']) {
  const styles: { fill?: Function; 'fill-opacity'?: Function } = {};

  if (scaleOptions!.hasOwnProperty('opacity')) {
    styles.fill = () =>
      // eslint-disable-next-line implicit-arrow-linebreak
      scaleOptions!.opacity!.baseColor || SCALE_BASE_OPACITY_COLOR;
    styles['fill-opacity'] = (d: ValueType) => _scale?.apply(d);
  } else {
    styles.fill = (d: ValueType) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      (typeof d === 'string' && d?.startsWith('#') ? d : _scale?.apply(d));
  }

  return styles;
}

export function applyScaleStyle(
  elem: any,
  _scale: any,
  scaleOptions: OptionsType['scale'],
  keyname?: string,
): void {
  Object.entries(scaleStyle(_scale, scaleOptions)).forEach(([prop, val]) =>
    // eslint-disable-next-line implicit-arrow-linebreak
    elem.style(prop, (d: SubDomain | string) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      val(keyname ? (d as SubDomain)[keyname as keyof SubDomain] : d)));
}
```

## File: src/options/Options.ts
```typescript
import mergeWith from 'lodash-es/mergeWith';
import isEqual from 'lodash-es/isEqual';
import has from 'lodash-es/has';
import get from 'lodash-es/get';
import set from 'lodash-es/set';
import type { Ls } from 'dayjs';
import type {
  DeepPartial, DomainType, Timestamp, TextAlign, Padding,
} from '../types';
import {
  OPTIONS_DEFAULT_DOMAIN_TYPE,
  OPTIONS_DEFAULT_SUBDOMAIN_TYPE,
  OPTIONS_DEFAULT_SUBDOMAIN_WIDTH,
  OPTIONS_DEFAULT_SUBDOMAIN_HEIGHT,
  OPTIONS_DEFAULT_SUBDOMAIN_GUTTER,
  OPTIONS_DEFAULT_SUBDOMAIN_RADIUS,
  OPTIONS_DEFAULT_THEME,
  OPTIONS_DEFAULT_ANIMATION_DURATION,
  OPTIONS_DEFAULT_ITEM_SELECTOR,
  OPTIONS_DEFAULT_RANGE,
  SCALE_BASE_COLOR_SCHEME,
  SCALE_BASE_COLOR_TYPE,
  SCALE_BASE_COLOR_DOMAIN,
  OPTIONS_DEFAULT_LOCALE,
} from '../constants';

import OptionsPreProcessors from './OptionsPreProcessors';

type SortOrder = 'asc' | 'desc';

export type DomainOptions = {
  type: DomainType;
  gutter: number;
  padding: Padding;
  dynamicDimension: boolean;
  label: LabelOptions;
  sort: SortOrder;
};

type LabelOptions = {
  text?:
  | string
  | null
  | ((timestamp: Timestamp, element: SVGElement) => string);
  position: 'top' | 'right' | 'bottom' | 'left';
  textAlign: TextAlign;
  offset: {
    x: number;
    y: number;
  };
  rotate: null | 'left' | 'right';
  width: number;
  height: number;
};

export type SubDomainOptions = {
  type: string;
  width: number;
  height: number;
  gutter: number;
  radius: number;
  label:
  | string
  | null
  | ((timestamp: Timestamp, value: number, element: SVGElement) => string);
  color?:
  | string
  | ((
    timestamp: Timestamp,
    value: number | string | null | undefined,
    backgroundColor: string,
  ) => string);
  sort: SortOrder;
};

export type DataGroupType = 'sum' | 'count' | 'min' | 'max' | 'average';

type DateOptions = {
  start: Date;
  min?: Date;
  max?: Date;
  highlight: Date[];
  locale: string | Partial<(typeof Ls)[0]>;
  timezone?: string;
};

export type DataRecord = Record<string, string | number>;
export type DataOptions = {
  source: string | DataRecord[];
  type: 'json' | 'csv' | 'tsv' | 'txt';
  requestInit: object;
  x: string | ((datum: DataRecord) => number);
  y: string | ((datum: DataRecord) => number);
  groupY:
  | DataGroupType
  | ((values: (string | number | null)[]) => string | number | null);
  defaultValue: null | number | string;
};

type ScaleOptions = {
  opacity?: {
    domain: number[];
    type?: string;
    baseColor: string;
  };
  color?: {
    domain: number[];
    scheme?: string;
    range?: string[];
    interpolate?: any;
    type?: string;
  };
};

export type OptionsType = {
  itemSelector: string;
  range: number;
  domain: DomainOptions;
  subDomain: SubDomainOptions;
  date: DateOptions;
  data: DataOptions;
  scale?: ScaleOptions;
  animationDuration: number;
  verticalOrientation: boolean;
  theme: 'light' | 'dark';
};

type InternalOptionsType = {
  x: {
    domainHorizontalLabelWidth: number;
    domainVerticalLabelHeight: number;
  };
};

export default class Options {
  options: OptionsType & InternalOptionsType;

  preProcessors: {
    [key: string]: (value: any) => any;
  };

  constructor(processors = OptionsPreProcessors) {
    this.preProcessors = processors;

    this.options = {
      // selector string of the container to append the graph to
      // Accept any string value accepted by document.querySelector or CSS3
      // or an Element object
      itemSelector: OPTIONS_DEFAULT_ITEM_SELECTOR,

      // Number of domain to display on the graph
      range: OPTIONS_DEFAULT_RANGE,

      domain: {
        type: OPTIONS_DEFAULT_DOMAIN_TYPE,

        // Space between each domain, in pixel
        gutter: 4,

        padding: [0, 0, 0, 0],

        // Whether to enable dynamic domain size
        // The width/height on a domain depends on the number of
        // subDomains items count
        dynamicDimension: true,

        // Whether to show most recent date first
        sort: 'asc',

        label: {
          // Formatting of the domain label
          // @default: undefined, will use the formatting
          // according to domain type
          // Accept any string accepted by dayjs.format()
          // or a function
          //
          // Refer to https://day.js.org/docs/en/display/format
          // for list of accepted string tokens used by dayjs.format()
          text: undefined,

          // valid: top, right, bottom, left
          position: 'bottom',

          // Valid are the direct svg values: start, middle, end
          textAlign: 'middle',

          // By default, there is no margin/padding around the label
          offset: {
            x: 0,
            y: 0,
          },

          rotate: null,

          // Used only on vertical orientation
          width: 100,

          // Used only on horizontal orientation
          height: 25,
        },
      },

      subDomain: {
        type: OPTIONS_DEFAULT_SUBDOMAIN_TYPE,

        // Width of each subDomain cell, in pixel
        width: OPTIONS_DEFAULT_SUBDOMAIN_WIDTH,

        // Height of each subDomain cell, in pixel
        height: OPTIONS_DEFAULT_SUBDOMAIN_HEIGHT,

        // Space between each subDomain cell, in pixel
        gutter: OPTIONS_DEFAULT_SUBDOMAIN_GUTTER,

        // Radius of each subDomain cell, in pixel
        radius: OPTIONS_DEFAULT_SUBDOMAIN_RADIUS,

        // Formatting of the text inside each subDomain cell
        // @default: null, no text
        // Accept any string accepted by dayjs.format()
        // or a function
        //
        // Refer to https://day.js.org/docs/en/display/format
        // for list of accepted string tokens used by dayjs.format()
        label: null,

        color: undefined,

        sort: 'asc',
      },

      date: {
        // Start date of the graph
        // @default now
        start: new Date(),

        min: undefined,

        max: undefined,

        // List of dates to highlight
        // Valid values:
        // - []: don't highlight anything
        // - an array of Date objects: highlight the specified dates
        highlight: [],

        locale: OPTIONS_DEFAULT_LOCALE,

        timezone: undefined,
      },

      // Calendar orientation
      // false: display domains side by side
      // true : display domains one under the other
      verticalOrientation: false,

      data: {
        // Data source
        // URL, where to fetch the original data
        source: '',

        // Data type
        // Default: json
        type: 'json',

        requestInit: {},

        // keyname of the time property
        x: '',

        // keyname of the value property
        y: '',

        // Grouping function of the values
        groupY: 'sum',

        defaultValue: null,
      },

      scale: undefined,

      // Animation duration, in ms
      animationDuration: OPTIONS_DEFAULT_ANIMATION_DURATION,

      // Theme mode: dark/light
      theme: OPTIONS_DEFAULT_THEME,

      // Internally used options, do not edit not set
      x: {
        domainHorizontalLabelWidth: 0,
        domainVerticalLabelHeight: 0,
      },
    };
  }

  /**
   * Set a new value for an option, only if unchanged
   * @param {string} key   Name of the option
   * @param {any} value Value of the option
   * @return {boolean} Whether the option have been changed
   */
  set(key: string, value: any): boolean {
    if (!has(this.options, key) || isEqual(get(this.options, key), value)) {
      return false;
    }

    set(
      this.options,
      key,
      has(this.preProcessors, key) ?
        get(this.preProcessors, key)(value) :
        value,
    );

    return true;
  }

  init(opts?: DeepPartial<OptionsType>): void {
    this.options = {
      // eslint-disable-next-line arrow-body-style
      ...mergeWith(this.options, opts, (_, srcValue) => {
        return Array.isArray(srcValue) ? srcValue : undefined;
      }),
    };

    const { options } = this;

    Object.keys(this.preProcessors).forEach((key) => {
      set(options, key, get(this.preProcessors, key)(get(options, key)));
    });

    if (typeof options.scale === 'undefined') {
      this.initScale();
    }

    options.x.domainVerticalLabelHeight = options.domain.label.height;

    // When the label is affecting the height
    if (
      options.domain.label.position === 'top' ||
      options.domain.label.position === 'bottom'
    ) {
      options.x.domainHorizontalLabelWidth = 0;
    } else {
      options.x.domainVerticalLabelHeight = 0;
      options.x.domainHorizontalLabelWidth = options.domain.label.width;
    }

    if (
      options.domain.label.text === null ||
      options.domain.label.text === ''
    ) {
      options.x.domainVerticalLabelHeight = 0;
      options.x.domainHorizontalLabelWidth = 0;
    }
  }

  initScale() {
    this.options.scale = {
      color: {
        scheme: SCALE_BASE_COLOR_SCHEME,
        type: SCALE_BASE_COLOR_TYPE,
        domain: SCALE_BASE_COLOR_DOMAIN,
      },
    };
  }
}
```

## File: src/options/OptionsPreProcessors.ts
```typescript
import castArray from 'lodash-es/castArray';
import isFunction from 'lodash-es/isFunction';
import isString from 'lodash-es/isString';
import type { SubDomainOptions } from './Options';

export default {
  range: (value: number): number => Math.max(+value, 1),
  'date.highlight': (args: Date[] | Date): Date[] => castArray(args),
  'subDomain.label': (
    value: SubDomainOptions['label'],
  ): string | Function | null =>
    // eslint-disable-next-line
    ((isString(value) && value !== '') || isFunction(value) ? value : null),
};
```

## File: src/options/OptionsValidator.ts
```typescript
import type TemplateCollection from '../TemplateCollection';
import type { DomainOptions, SubDomainOptions, DataOptions } from './Options';
import type { DomainType } from '../types';

const ALLOWED_DATA_TYPES = ['json', 'csv', 'tsv', 'txt'];

/**
 * Ensure that critical options are valid
 *
 * @throw {Error} on critical invalid options
 * @return {boolean} Returns true when there is not critical errors
 */
export default function validate(
  templateCollection: TemplateCollection,
  {
    domain,
    subDomain,
    data,
  }: {
    domain: Partial<DomainOptions>;
    subDomain: Partial<SubDomainOptions>;
    data: Partial<DataOptions>;
  },
): boolean {
  const domainType = domain.type as DomainType;
  const subDomainType = subDomain.type as string;

  if (!templateCollection.has(domainType)) {
    throw new Error(`'${domainType}' is not a valid domain type'`);
  }

  if (!templateCollection.has(subDomainType)) {
    throw new Error(`'${subDomainType}' is not a valid subDomain type'`);
  }

  if (data.type && !ALLOWED_DATA_TYPES.includes(data.type)) {
    throw new Error(`The data type '${data.type}' is not valid data type`);
  }

  if (
    !(templateCollection.get(subDomainType).allowedDomainType || []).includes(
      domainType,
    )
  ) {
    throw new Error(
      `The subDomain.type '${subDomainType}' can not be used together ` +
        `with the domain type ${domainType}`,
    );
  }

  return true;
}
```

## File: src/plugins/PluginManager.ts
```typescript
import isEqual from 'lodash-es/isEqual';

import type CalHeatmap from '../CalHeatmap';
import {
  IPlugin,
  PluginOptions,
} from '../types';

type PluginSetting = {
  options?: PluginOptions;
  dirty: boolean;
};

function extractPluginName(plugin: IPlugin): string {
  return `${plugin.constructor.name}${plugin.options?.key || ''}`;
}

export default class PluginManager {
  calendar: CalHeatmap;

  settings: Map<string, PluginSetting>;

  plugins: Map<string, IPlugin>;

  pendingPaint: Set<IPlugin>;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
    this.settings = new Map();
    this.plugins = new Map();
    this.pendingPaint = new Set();
  }

  add(plugins: IPlugin[]): void {
    plugins.forEach((plugin) => {
      const name = extractPluginName(plugin);

      const existingPlugin = this.plugins.get(name);

      if (
        existingPlugin &&
        this.settings.get(name) &&
        isEqual(this.settings.get(name)!.options, plugin.options)
      ) {
        return;
      }

      this.settings.set(name, {
        options: plugin.options,
        dirty: true,
      });

      if (!this.plugins.has(name)) {
        this.plugins.set(name, plugin);
      }

      this.pendingPaint.add(this.plugins.get(name)!);
    });
  }

  setupAll(): void {
    this.plugins.forEach((pluginInstance, name) => {
      const settings = this.settings.get(name);

      if (typeof settings !== 'undefined') {
        if (settings.dirty) {
          pluginInstance.setup(this.calendar, settings.options);
          settings.dirty = false;

          this.settings.set(name, settings);
        }
      }
    });
  }

  paintAll(): Promise<unknown>[] {
    return Array.from(this.pendingPaint.values()).map((p) => p.paint());
  }

  destroyAll(): Promise<unknown>[] {
    return this.allPlugins().map((p) => p.destroy());
  }

  getFromPosition(position: PluginOptions['position']): IPlugin[] {
    return this.allPlugins().filter(
      (plugin) =>
        // eslint-disable-next-line implicit-arrow-linebreak
        plugin.options?.position === position,
    );
  }

  getHeightFromPosition(position: PluginOptions['position']): number {
    return this.getFromPosition(position)
      .map((d) => d.options.dimensions!.height)
      .reduce((a, b) => a + b, 0);
  }

  getWidthFromPosition(position: PluginOptions['position']): number {
    return this.getFromPosition(position)
      .map((d) => d.options.dimensions!.width)
      .reduce((a, b) => a + b, 0);
  }

  allPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }
}
```

## File: src/plugins/PluginPainter.ts
```typescript
import type CalHeatmap from '../CalHeatmap';

class PluginPainter {
  calendar: CalHeatmap;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
  }

  paint(): Promise<unknown>[] {
    let promises: Promise<unknown>[] = [];

    promises = promises.concat(this.calendar.pluginManager.paintAll());
    promises = promises.concat(this.setPluginsPosition());

    return promises;
  }

  setPluginsPosition(): Promise<unknown>[] {
    const { pluginManager } = this.calendar;
    const { animationDuration } = this.calendar.options.options;
    const { domainsContainerPainter } = this.calendar.calendarPainter;

    const top = pluginManager.getFromPosition('top');
    const right = pluginManager.getFromPosition('right');
    const bottom = pluginManager.getFromPosition('bottom');
    const left = pluginManager.getFromPosition('left');

    const topHeight = pluginManager.getHeightFromPosition('top');
    const leftWidth = pluginManager.getWidthFromPosition('left');

    const promises: Promise<unknown>[] = [];

    let topOffset = 0;
    top.forEach((plugin) => {
      promises.push(
        plugin.root
          .transition()
          .duration(animationDuration)
          .attr('y', topOffset)
          .attr('x', leftWidth)
          .end(),
      );
      topOffset += plugin.options.dimensions!.height;
    });

    let leftOffset = 0;
    left.forEach((plugin) => {
      promises.push(
        plugin.root
          .transition()
          .duration(animationDuration)
          .attr('x', leftOffset)
          .attr('y', topHeight)
          .end(),
      );
      leftOffset += plugin.options.dimensions!.width;
    });

    bottom.forEach((plugin) => {
      promises.push(
        plugin.root
          .transition()
          .duration(animationDuration)
          .attr('x', leftWidth)
          .attr('y', topHeight + domainsContainerPainter.height())
          .end(),
      );
    });

    leftOffset += domainsContainerPainter.width();

    right.forEach((plugin) => {
      promises.push(
        plugin.root
          .transition()
          .duration(animationDuration)
          .attr('x', leftOffset)
          .attr('y', topHeight)
          .end(),
      );
      leftOffset += plugin.options.dimensions!.width;
    });

    return promises;
  }

  insideWidth() {
    return (
      this.calendar.pluginManager.getWidthFromPosition('left') +
      this.calendar.pluginManager.getWidthFromPosition('right')
    );
  }

  insideHeight() {
    return (
      this.calendar.pluginManager.getHeightFromPosition('top') +
      this.calendar.pluginManager.getHeightFromPosition('bottom')
    );
  }
}

export default PluginPainter;
```

## File: src/subDomain/SubDomainPainter.ts
```typescript
import {
  Position,
  SUBDOMAIN_SELECTOR,
  SUBDOMAIN_HIGHLIGHT_CLASSNAME,
} from '../constants';

import type CalHeatmap from '../CalHeatmap';
import type { Timestamp, SubDomain } from '../types';

export default class SubDomainPainter {
  calendar: CalHeatmap;

  root: any;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
    this.root = null;
  }

  paint(root: any): void {
    this.root = root || this.root;
    const containerClassname = `${SUBDOMAIN_SELECTOR}-container`;

    const subDomainSvgGroup = this.root
      .selectAll(containerClassname)
      .data(
        (d: Timestamp) => [d],
        (d: Timestamp) => d,
      )
      .join(
        (enter: any) => enter
          .append('svg')
          .call((selection: any) => this.#setPositions(selection))
          .attr('class', containerClassname.slice(1)),

        (update: any) =>
          // eslint-disable-next-line implicit-arrow-linebreak
          update.call((selection: any) => this.#setPositions(selection)),
      );

    const {
      subDomain: {
        radius, width, height, sort,
      },
    } = this.calendar.options.options;
    const evt = this.calendar.eventEmitter;

    subDomainSvgGroup
      .selectAll('g')
      .data((d: Timestamp) => {
        const subDomainsCollection: SubDomain[] =
          this.calendar.domainCollection.get(d)!;
        if (sort === 'desc') {
          const max = Math.max(
            ...subDomainsCollection.map((s: SubDomain) => s.x),
          );
          subDomainsCollection.forEach((s: SubDomain, i: number) => {
            subDomainsCollection[i].x = Math.abs(s.x - max);
          });
        }

        return subDomainsCollection;
      })
      .join(
        (enter: any) => enter
          .append('g')
          .call((selection: any) => selection
            .insert('rect')
            .attr('class', (d: SubDomain) =>
            // eslint-disable-next-line implicit-arrow-linebreak
              this.#classname(d.t, `${SUBDOMAIN_SELECTOR.slice(1)}-bg`))
            .attr('width', width)
            .attr('height', height)
            .attr('x', (d: SubDomain) => this.#getX(d))
            .attr('y', (d: SubDomain) => this.#getY(d))
            .on('click', (ev: PointerEvent, d: SubDomain) =>
            // eslint-disable-next-line implicit-arrow-linebreak
              evt.emit('click', ev, d.t, d.v))
            .on('mouseover', (ev: PointerEvent, d: SubDomain) =>
            // eslint-disable-next-line implicit-arrow-linebreak
              evt.emit('mouseover', ev, d.t, d.v))
            .on('mouseout', (ev: PointerEvent, d: SubDomain) =>
            // eslint-disable-next-line implicit-arrow-linebreak
              evt.emit('mouseout', ev, d.t, d.v))
            .attr('rx', radius > 0 ? radius : null)
            .attr('ry', radius > 0 ? radius : null))
          .call((selection: any) => this.#appendText(selection)),
        (update: any) => update
          .selectAll('rect')
          .attr('class', (d: SubDomain) =>
          // eslint-disable-next-line implicit-arrow-linebreak
            this.#classname(d.t, `${SUBDOMAIN_SELECTOR.slice(1)}-bg`))
          .attr('width', width)
          .attr('height', height)
          .attr('x', (d: SubDomain) => this.#getX(d))
          .attr('y', (d: SubDomain) => this.#getY(d))
          .attr('rx', radius)
          .attr('ry', radius),
      );
  }

  /**
   * Set the subDomain group X and Y position
   * @param {d3-selection} selection A d3-selection object
   */
  #setPositions(selection: any): void {
    const { options } = this.calendar.options;
    const {
      padding,
      label: { position },
    } = options.domain;

    selection
      .attr('x', () => {
        let pos = padding[Position.LEFT];
        if (position === 'left') {
          pos += options.x.domainHorizontalLabelWidth;
        }
        return pos;
      })
      .attr('y', () => {
        let pos = padding[Position.TOP];
        if (position === 'top') {
          pos += options.x.domainVerticalLabelHeight;
        }
        return pos;
      });
  }

  /**
   * Return a classname if the specified date should be highlighted
   *
   * @param  {number} timestamp Unix timestamp of the current subDomain
   * @return {String} the highlight class
   */
  #classname(timestamp: Timestamp, ...otherClasses: string[]): string {
    const {
      date: { highlight },
      subDomain: { type },
    } = this.calendar.options.options;
    let classname = '';

    if (highlight.length > 0) {
      highlight.forEach((d) => {
        const unitFn = this.calendar.templateCollection.get(type).extractUnit;

        if (unitFn(+d) === unitFn(timestamp)) {
          classname = SUBDOMAIN_HIGHLIGHT_CLASSNAME;
        }
      });
    }

    return [classname, ...otherClasses].join(' ').trim();
  }

  #appendText(elem: any) {
    const { width, height, label } = this.calendar.options.options.subDomain;

    if (!label) {
      return null;
    }

    return elem
      .append('text')
      .attr('class', (d: SubDomain) =>
        // eslint-disable-next-line implicit-arrow-linebreak
        this.#classname(d.t, `${SUBDOMAIN_SELECTOR.slice(1)}-text`))
      .attr('x', (d: SubDomain) => this.#getX(d) + width / 2)
      .attr('y', (d: SubDomain) => this.#getY(d) + height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text((d: SubDomain, i: number, nodes: any[]) =>
        // eslint-disable-next-line implicit-arrow-linebreak
        this.calendar.dateHelper.format(d.t, label, d.v, nodes[i]));
  }

  #getCoordinates(axis: 'x' | 'y', d: SubDomain): number {
    const { subDomain } = this.calendar.options.options;
    return (
      d[axis] *
      (subDomain[axis === 'x' ? 'width' : 'height'] + subDomain.gutter)
    );
  }

  #getX(d: SubDomain): number {
    return this.#getCoordinates('x', d);
  }

  #getY(d: SubDomain): number {
    return this.#getCoordinates('y', d);
  }
}
```

## File: src/templates/day.ts
```typescript
import type { OptionsType, DomainOptions } from '../options/Options';
import type { Template, DomainType } from '../types';

const dayTemplate: Template = (
  DateHelper,
  {
    domain,
    verticalOrientation,
  }: {
    domain: DomainOptions;
    verticalOrientation: OptionsType['verticalOrientation'];
  },
) => {
  const ROWS_COUNT = 7;
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['year', 'month', 'week'];

  return {
    name: 'day',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => (domain.type === 'week' ? 1 : ROWS_COUNT),
    columnsCount: (ts) => {
      switch (domain.type) {
        case 'month':
          return Math.ceil(
            domain.dynamicDimension && !verticalOrientation ?
              DateHelper.getMonthWeekNumber(
                DateHelper.date(ts).endOf('month'),
              ) :
              6, // In rare case, when the first week contains less than 3 days
          );
        case 'year':
          return Math.ceil(
            domain.dynamicDimension ?
              DateHelper.date(ts).endOf('year').dayOfYear() / ROWS_COUNT :
              54,
          );
        case 'week':
        default:
          return ROWS_COUNT;
      }
    },
    mapping: (startTimestamp, endTimestamp) => {
      let weekNumber = 0;
      let x = -1;

      return DateHelper.intervals(
        'day',
        startTimestamp,
        DateHelper.date(endTimestamp),
      ).map((ts) => {
        const date = DateHelper.date(ts);

        switch (domain.type) {
          case 'month':
            x = DateHelper.getMonthWeekNumber(ts) - 1;
            break;
          case 'year':
            if (weekNumber !== date.week()) {
              weekNumber = date.week();
              x += 1;
            }
            break;
          case 'week':
            x = date.weekday();
            break;
          default:
        }

        return {
          t: ts,
          x,
          y: domain.type === 'week' ? 0 : date.weekday(),
        };
      });
    },
    extractUnit: (ts) => DateHelper.date(ts).startOf('day').valueOf(),
  };
};

export default dayTemplate;
```

## File: src/templates/ghDay.ts
```typescript
import type { Template, DomainType } from '../types';

const dayTemplate: Template = (DateHelper) => {
  const ROWS_COUNT = 7;
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['month'];

  return {
    name: 'ghDay',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => ROWS_COUNT,
    columnsCount: (ts) => DateHelper.getWeeksCountInMonth(ts),
    mapping: (startTimestamp, endTimestamp) => {
      const clampStart = DateHelper.getFirstWeekOfMonth(startTimestamp);
      const clampEnd = DateHelper.getFirstWeekOfMonth(endTimestamp);

      let x = -1;
      const pivotDay = clampStart.weekday();

      return DateHelper.intervals('day', clampStart, clampEnd).map((ts) => {
        const weekday = DateHelper.date(ts).weekday();
        if (weekday === pivotDay) {
          x += 1;
        }

        return {
          t: ts,
          x,
          y: weekday,
        };
      });
    },
    extractUnit: (ts) => DateHelper.date(ts).startOf('day').valueOf(),
  };
};

export default dayTemplate;
```

## File: src/templates/hour.ts
```typescript
import type { DomainOptions } from '../options/Options';
import type { Template, DomainType } from '../types';

const hourTemplate: Template = (
  DateHelper,
  { domain }: { domain: DomainOptions },
) => {
  const TOTAL_ITEMS = 24;
  const ROWS_COUNT = 6;
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['month', 'week', 'day'];

  return {
    name: 'hour',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => ROWS_COUNT,
    columnsCount: (ts) => {
      switch (domain.type) {
        case 'week':
          return (TOTAL_ITEMS / ROWS_COUNT) * 7;
        case 'month':
          return (
            (TOTAL_ITEMS / ROWS_COUNT) *
            (domain.dynamicDimension ? DateHelper.date(ts).daysInMonth() : 31)
          );
        case 'day':
        default:
          return TOTAL_ITEMS / ROWS_COUNT;
      }
    },
    mapping: (startTimestamp, endTimestamp) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      DateHelper.intervals(
        'hour',
        startTimestamp,
        DateHelper.date(endTimestamp),
      ).map((ts) => {
        const date = DateHelper.date(ts);
        const hour = date.hour();
        const monthDate = date.date();
        let baseX = Math.floor(hour / ROWS_COUNT);
        const columnOffset = TOTAL_ITEMS / ROWS_COUNT;

        if (domain.type === 'month') {
          baseX += (monthDate - 1) * columnOffset;
        }
        if (domain.type === 'week') {
          baseX += +date.format('d') * columnOffset;
        }

        return {
          t: ts,
          x: baseX,
          y: Math.floor(hour % ROWS_COUNT),
        };
      }),
    extractUnit: (ts) => DateHelper.date(ts).startOf('hour').valueOf(),
  };
};

export default hourTemplate;
```

## File: src/templates/index.ts
```typescript
import minuteTemplate from './minute';
import hourTemplate from './hour';
import dayTemplate from './day';
import xDayTemplate from './xDay';
import ghDayTemplate from './ghDay';
import weekTemplate from './week';
import monthTemplate from './month';
import yearTemplate from './year';

export default [
  minuteTemplate,
  hourTemplate,
  dayTemplate,
  xDayTemplate,
  ghDayTemplate,
  weekTemplate,
  monthTemplate,
  yearTemplate,
];
```

## File: src/templates/minute.ts
```typescript
import type { Template, DomainType } from '../types';

const minuteTemplate: Template = (DateHelper) => {
  const COLUMNS_COUNT = 10;
  const ROWS_COUNT = 6;
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['day', 'hour'];

  return {
    name: 'minute',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => COLUMNS_COUNT,
    columnsCount: () => ROWS_COUNT,
    mapping: (startTimestamp, endTimestamp) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      DateHelper.intervals(
        'minute',
        startTimestamp,
        DateHelper.date(endTimestamp),
      ).map((ts, index: number) => ({
        t: ts,
        x: Math.floor(index / COLUMNS_COUNT),
        y: index % COLUMNS_COUNT,
      })),
    extractUnit: (ts) => DateHelper.date(ts).startOf('minute').valueOf(),
  };
};

export default minuteTemplate;
```

## File: src/templates/month.ts
```typescript
import type { Template, DomainType } from '../types';

const monthTemplate: Template = (DateHelper) => {
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['year'];

  return {
    name: 'month',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => 1,
    columnsCount: () => 12,
    mapping: (startTimestamp, endTimestamp) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      DateHelper.intervals(
        'month',
        startTimestamp,
        DateHelper.date(endTimestamp),
      ).map((ts) => ({
        t: ts,
        x: DateHelper.date(ts).month(),
        y: 0,
      })),
    extractUnit: (ts) => DateHelper.date(ts).startOf('month').valueOf(),
  };
};

export default monthTemplate;
```

## File: src/templates/week.ts
```typescript
import type { DomainOptions } from '../options/Options';
import type { Template, DomainType } from '../types';

const weekTemplate: Template = (
  DateHelper,
  { domain }: { domain: DomainOptions },
) => {
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['year', 'month'];

  return {
    name: 'week',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => 1,
    columnsCount: (ts) => {
      switch (domain.type) {
        case 'year':
          return domain.dynamicDimension ?
            DateHelper.date(ts).endOf('year').isoWeeksInYear() :
            53;
        case 'month':
          return domain.dynamicDimension ?
            DateHelper.getWeeksCountInMonth(ts) :
            5;
        default:
          return 1;
      }
    },
    mapping: (startTimestamp, endTimestamp) => {
      const clampStart = DateHelper.getFirstWeekOfMonth(startTimestamp);
      const clampEnd = DateHelper.getFirstWeekOfMonth(endTimestamp);

      return DateHelper.intervals('week', clampStart, clampEnd).map(
        (ts, i) => ({
          t: ts,
          x: i,
          y: 0,
        }),
      );
    },
    extractUnit: (ts) => DateHelper.date(ts).startOf('week').valueOf(),
  };
};

export default weekTemplate;
```

## File: src/templates/xDay.ts
```typescript
import type { OptionsType, DomainOptions } from '../options/Options';
import type { Template, DomainType } from '../types';

const dayTemplate: Template = (
  DateHelper,
  {
    domain,
    verticalOrientation,
  }: {
    domain: DomainOptions;
    verticalOrientation: OptionsType['verticalOrientation'];
  },
) => {
  const COLUMNS_COUNT = 7;
  const ALLOWED_DOMAIN_TYPE: DomainType[] = ['year', 'month', 'week'];

  return {
    name: 'xDay',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: (ts) => {
      switch (domain.type) {
        case 'month':
          return Math.ceil(
            domain.dynamicDimension && !verticalOrientation ?
              DateHelper.getMonthWeekNumber(
                DateHelper.date(ts).endOf('month'),
              ) :
              6, // In rare case, when the first week contains less than 3 days
          );
        case 'year':
          return Math.ceil(
            domain.dynamicDimension ?
              DateHelper.date(ts).endOf('year').dayOfYear() / COLUMNS_COUNT :
              54,
          );
        case 'week':
        default:
          return COLUMNS_COUNT;
      }
    },
    columnsCount: () => {
      if (domain.type === 'week') {
        return 1;
      }
      return COLUMNS_COUNT;
    },
    mapping: (startTimestamp, endTimestamp) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      DateHelper.intervals(
        'day',
        startTimestamp,
        DateHelper.date(endTimestamp),
      ).map((ts) => {
        const date = DateHelper.date(ts);
        const endWeekNumber = date.endOf('year').week();
        let x = 0;

        switch (domain.type) {
          case 'month':
            x = DateHelper.getMonthWeekNumber(ts) - 1;
            break;
          case 'year':
            if (endWeekNumber === 1 && date.week() === endWeekNumber) {
              x = date.subtract(1, 'week').week() + 1;
            }

            x = date.week() - 1;
            break;
          case 'week':
            x = date.weekday();
            break;
          default:
        }

        return {
          t: ts,
          y: x,
          x: domain.type === 'week' ? 0 : date.weekday(),
        };
      }),
    extractUnit: (ts) => DateHelper.date(ts).startOf('day').valueOf(),
  };
};

export default dayTemplate;
```

## File: src/templates/year.ts
```typescript
import type { Template, DomainType } from '../types';

const yearTemplate: Template = (DateHelper) => {
  const ALLOWED_DOMAIN_TYPE: DomainType[] = [];

  return {
    name: 'year',
    allowedDomainType: ALLOWED_DOMAIN_TYPE,
    rowsCount: () => 1,
    columnsCount: () => 1,
    mapping: (startTimestamp, endTimestamp) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      DateHelper.intervals(
        'year',
        startTimestamp,
        DateHelper.date(endTimestamp),
      ).map((ts, index) => ({
        t: ts,
        x: index,
        y: 0,
      })),
    extractUnit: (ts) => DateHelper.date(ts).startOf('year').valueOf(),
  };
};

export default yearTemplate;
```

## File: src/CalHeatmap.ts
```typescript
import EventEmitter from 'eventemitter3';
import castArray from 'lodash-es/castArray';
import type { PluginFunc } from 'dayjs';
import type dayjs from 'dayjs';

import Navigator from './calendar/Navigator';
import CalendarPainter from './calendar/CalendarPainter';
import Populator from './calendar/Populator';
import Options from './options/Options';
import DataFetcher from './DataFetcher';
import DomainCollection from './calendar/DomainCollection';
import DateHelper from './helpers/DateHelper';
import validate from './options/OptionsValidator';
import PluginManager from './plugins/PluginManager';
import TemplateCollection from './TemplateCollection';
import { ScrollDirection } from './constants';
import VERSION from './version';

import './cal-heatmap.scss';

import type { OptionsType } from './options/Options';
import type {
  Template,
  Dimensions,
  IPlugin,
  Timestamp,
  DeepPartial,
} from './types';

export default class CalHeatmap {
  static readonly VERSION = VERSION;

  options: Options;

  calendarPainter: CalendarPainter;

  populator: Populator;

  navigator: Navigator;

  eventEmitter: EventEmitter;

  dataFetcher: DataFetcher;

  domainCollection!: DomainCollection;

  templateCollection: TemplateCollection;

  dateHelper: DateHelper;

  pluginManager: PluginManager;

  constructor() {
    // Default options
    this.options = new Options();

    // Init the helpers with the default options
    this.dateHelper = new DateHelper();
    this.templateCollection = new TemplateCollection(
      this.dateHelper,
      this.options,
    );
    this.dataFetcher = new DataFetcher(this);
    this.navigator = new Navigator(this);
    this.populator = new Populator(this);

    this.calendarPainter = new CalendarPainter(this);
    this.eventEmitter = new EventEmitter();
    this.pluginManager = new PluginManager(this);
  }

  createDomainCollection(
    startDate: Timestamp | Date,
    range: number | Date,
    excludeEnd: boolean = true,
  ): DomainCollection {
    return new DomainCollection(
      this.dateHelper,
      this.options.options.domain.type,
      startDate,
      range,
      excludeEnd,
    );
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Setup and paint the calendar with the given options
   *
   * @param  {Object} options The Options object
   * @param  {Array} plugins An optional array of plugins to add to the calendar
   * @return A Promise, which will fulfill once all the underlying asynchronous
   * tasks settle, whether resolved or rejected.
   */
  async paint(
    options?: DeepPartial<OptionsType>,
    plugins?: IPlugin[] | IPlugin,
  ): Promise<unknown> {
    this.options.init(options);
    await this.dateHelper.setup(this.options);

    this.templateCollection.init();

    try {
      validate(this.templateCollection, this.options.options);
    } catch (error) {
      return Promise.reject(error);
    }

    if (plugins) {
      this.pluginManager.add(castArray(plugins));
    }

    this.calendarPainter.setup();

    // Record all the valid domains
    // Each domain value is a timestamp in milliseconds
    this.domainCollection = new DomainCollection(this.dateHelper);
    this.navigator.loadNewDomains(
      this.createDomainCollection(
        this.options.options.date.start,
        this.options.options.range,
      ),
    );

    return Promise.allSettled([this.calendarPainter.paint(), this.fill()]);
  }

  /**
   * Add a new subDomainTemplate
   *
   * @since 4.0.0
   * @param  {SubDomainTemplate[] | SubDomainTemplate} templates
   * A single, or an array of SubDomainTemplate object
   * @return void
   */
  addTemplates(templates: Template | Template[]): void {
    this.templateCollection.add(templates);
  }

  /**
   * Shift the calendar by n domains forward
   *
   * @param {number} n Number of domain intervals to shift forward
   * @return A Promise, which will fulfill once all the underlying asynchronous
   * tasks settle, whether resolved or rejected.
   */
  next(n: number = 1): Promise<unknown> {
    const loadDirection = this.navigator.loadNewDomains(
      this.createDomainCollection(this.domainCollection.max, n + 1).slice(n),
      ScrollDirection.SCROLL_FORWARD,
    );

    return Promise.allSettled([
      this.calendarPainter.paint(loadDirection),
      this.fill(),
    ]);
  }

  /**
   * Shift the calendar by n domains backward
   *
   * @param {number} n Number of domain intervals to shift backward
   * @return A Promise, which will fulfill once all the underlying asynchronous
   * tasks settle, whether resolved or rejected.
   */
  previous(n: number = 1): Promise<unknown> {
    const loadDirection = this.navigator.loadNewDomains(
      this.createDomainCollection(this.domainCollection.min, -n),
      ScrollDirection.SCROLL_BACKWARD,
    );

    return Promise.allSettled([
      this.calendarPainter.paint(loadDirection),
      this.fill(),
    ]);
  }

  /**
   * Jump directly to a specific date
   *
   * JumpTo will scroll the calendar until the wanted domain with the specified
   * date is visible. Unless you set reset to true, the wanted domain
   * will not necessarily be the first domain of the calendar.
   *
   * @param {Date} date Jump to the domain containing that date
   * @param {boolean} reset Whether the wanted domain
   * should be the first domain of the calendar
   * @return A Promise, which will fulfill once all the underlying asynchronous
   * tasks settle, whether resolved or rejected.
   */
  jumpTo(date: Date, reset: boolean = false): Promise<unknown> {
    return Promise.allSettled([
      this.calendarPainter.paint(this.navigator.jumpTo(date, reset)),
      this.fill(),
    ]);
  }

  /**
   * Fill the calendar with the given data
   *
   * @param  {Object|string}    dataSource    The calendar's datasource,
   * same type as `options.data.source`
   * @return A Promise, which will fulfill once all the underlying asynchronous
   * tasks settle, whether resolved or rejected.
   */
  fill(dataSource = this.options.options.data.source): Promise<unknown> {
    const { options } = this.options;
    const template = this.templateCollection;
    const endDate = this.dateHelper.intervals(
      options.domain.type,
      this.domainCollection.max,
      2,
    )[1];

    const dataPromise = this.dataFetcher.getDatas(
      dataSource,
      this.domainCollection.min,
      endDate,
    );

    return new Promise((resolve, reject) => {
      dataPromise.then(
        (data: any) => {
          this.domainCollection.fill(
            data,
            options.data,
            template.get(options.subDomain.type)!.extractUnit,
          );
          this.populator.populate();
          resolve(null);
        },
        (error) => {
          reject(error);
        },
      );
    });
  }

  /**
   * Listener for all events
   *
   * @since 4.0.0
   * @param  {string}  name  Name of the event to listen to
   * @param  {function} fn function to execute on event trigger
   * @return void
   */
  on(name: string, fn: (...args: any[]) => any): void {
    this.eventEmitter.on(name, fn);
  }

  dimensions(): Dimensions {
    return this.calendarPainter.dimensions;
  }

  /**
   * Destroy the calendar
   *
   * @since  3.3.6
   * @return A Promise, which will fulfill once all the underlying asynchronous
   * tasks settle, whether resolved or rejected.
   */
  destroy(): Promise<unknown> {
    return this.calendarPainter.destroy();
  }

  extendDayjs(plugin: PluginFunc): dayjs.Dayjs {
    return this.dateHelper.extend(plugin);
  }
}
```

## File: src/constants.ts
```typescript
export enum ScrollDirection {
  SCROLL_NONE,
  SCROLL_BACKWARD,
  SCROLL_FORWARD,
}

export enum Position {
  TOP,
  RIGHT,
  BOTTOM,
  LEFT,
}

export const OPTIONS_DEFAULT_DOMAIN_TYPE = 'hour';

export const OPTIONS_DEFAULT_SUBDOMAIN_TYPE = 'minute';
export const OPTIONS_DEFAULT_SUBDOMAIN_WIDTH = 10;
export const OPTIONS_DEFAULT_SUBDOMAIN_HEIGHT = 10;
export const OPTIONS_DEFAULT_SUBDOMAIN_GUTTER = 2;
export const OPTIONS_DEFAULT_SUBDOMAIN_RADIUS = 0;
export const OPTIONS_DEFAULT_ANIMATION_DURATION = 200;
export const OPTIONS_DEFAULT_RANGE = 12;
export const OPTIONS_DEFAULT_ITEM_SELECTOR = '#cal-heatmap';
export const OPTIONS_DEFAULT_THEME = 'light';
export const OPTIONS_DEFAULT_LOCALE = 'en';

export const SCALE_BASE_OPACITY_COLOR = 'red';
export const SCALE_BASE_COLOR_SCHEME = 'YlOrBr';
export const SCALE_BASE_COLOR_TYPE = 'quantize';
export const SCALE_BASE_COLOR_DOMAIN = [0, 100];

export const CALENDAR_CONTAINER_SELECTOR = '.ch-container';
export const DOMAIN_SELECTOR = '.ch-domain';
export const DOMAIN_LABEL_SELECTOR = '.ch-domain-text';
export const SUBDOMAIN_SELECTOR = '.ch-subdomain';
export const SUBDOMAIN_HIGHLIGHT_CLASSNAME = 'highlight';
```

## File: src/DataFetcher.ts
```typescript
import {
  json, csv, dsv, text,
} from 'd3-fetch';

import type { DataOptions, DataRecord } from './options/Options';
import type { Timestamp } from './types';
import type CalHeatmap from './CalHeatmap';

export default class DataFetcher {
  calendar: CalHeatmap;

  constructor(calendar: CalHeatmap) {
    this.calendar = calendar;
  }

  /**
   * Fetch and interpret data from the datasource
   *
   * @param {string|object} source
   * @param {number} startTimestamp
   * @param {number} endTimestamp
   *
   * @return {Promise} A promise, that will return the final data when resolved
   */
  async getDatas(
    source: DataOptions['source'],
    startTimestamp: Timestamp,
    endTimestamp: Timestamp,
  ): Promise<unknown> {
    if (typeof source === 'string' && source.length > 0) {
      return this.#fetch(source, startTimestamp, endTimestamp);
    }

    let d: DataRecord[] = [];
    if (Array.isArray(source)) {
      d = source;
    }

    return Promise.resolve(d);
  }

  parseURI(
    str: string,
    startTimestamp: Timestamp,
    endTimestamp: Timestamp,
  ): string {
    let newUri = str.replace(/\{\{start=(.*?)\}\}/g, (_, format) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      this.calendar.dateHelper.date(startTimestamp).format(format));
    newUri = newUri.replace(/\{\{end=(.*?)\}\}/g, (_, format) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      this.calendar.dateHelper.date(endTimestamp).format(format));

    return newUri;
  }

  #fetch(
    source: DataOptions['source'],
    startTimestamp: Timestamp,
    endTimestamp: Timestamp,
  ): Promise<unknown> {
    const { type, requestInit } = this.calendar.options.options.data;

    const url = this.parseURI(source as string, startTimestamp, endTimestamp);

    switch (type) {
      case 'json':
        return json(url, requestInit);
      case 'csv':
        return csv(url, requestInit);
      case 'tsv':
        return dsv('\t', url, requestInit);
      case 'txt':
        return text(url, requestInit);
      default:
        return Promise.resolve([]);
    }
  }
}
```

## File: src/index.ts
```typescript
import CalHeatmap from './CalHeatmap';
import * as constants from './constants';
import * as positionHelpers from './helpers/PositionHelper';
import * as scaleHelpers from './helpers/ScaleHelper';

const helpers = { position: positionHelpers, scale: scaleHelpers };

export default CalHeatmap;
export { constants, helpers };
```

## File: src/TemplateCollection.ts
```typescript
import castArray from 'lodash-es/castArray';

import DefaultTemplates from './templates/index';
import type Options from './options/Options';
import type { Template, TemplateResult } from './types';
import type DateHelper from './helpers/DateHelper';

export default class TemplateCollection {
  dateHelper: DateHelper;

  options: Options;

  settings: Map<string, TemplateResult>;

  // Whether the default templates has been initiated
  initiated: boolean;

  constructor(dateHelper: DateHelper, options: Options) {
    this.settings = new Map();
    this.dateHelper = dateHelper;
    this.options = options;
    this.initiated = false;
  }

  get(subDomainType: string): TemplateResult {
    return this.settings.get(subDomainType)!;
  }

  has(subDomainType: string): boolean {
    return this.settings.has(subDomainType);
  }

  init() {
    if (!this.initiated) {
      this.initiated = true;
      this.add(DefaultTemplates);
    }
  }

  add(templates: Template | Template[]) {
    this.init();

    const tplWithParent: string[] = [];
    castArray(templates).forEach((f) => {
      const template = f(this.dateHelper, this.options.options);
      this.settings.set(template.name, template);

      if (template.hasOwnProperty('parent')) {
        tplWithParent.push(template.name);
      }
    });

    tplWithParent.forEach((name) => {
      const parentTemplate = this.settings.get(
        this.settings.get(name)!.parent!,
      );

      if (!parentTemplate) {
        return;
      }

      this.settings.set(name, {
        ...parentTemplate,
        ...this.settings.get(name),
      });
    });
  }
}
```

## File: src/types.d.ts
```typescript
import type { PluginFunc } from 'dayjs';
import type dayjs from 'dayjs';
import type EventEmitter from 'eventemitter3';
import type Options, { OptionsType } from './options/Options';
import type DateHelper from './helpers/DateHelper';
import type CalendarPainter from './calendar/CalendarPainter';

export type Timestamp = number;
export type DomainType =
    | 'year'
    | 'month'
    | 'week'
    | 'xDay'
    | 'ghDay'
    | 'day'
    | 'hour'
    | 'minute';
export type TextAlign = 'start' | 'middle' | 'end';
export type Padding = [number, number, number, number];

export type DeepPartial<T> = T extends object
  ? {
    [P in keyof T]?: DeepPartial<T[P]>;
  }
  : T;

// Template

export type Template = {
  (dateHelper: DateHelper, options: OptionsType): TemplateResult;
};

export type TemplateResult = {
  name: string;
  parent?: string;
  allowedDomainType: DomainType[];
  rowsCount: (ts: Timestamp) => number;
  columnsCount: (ts: Timestamp) => number;
  mapping: (
    startTimestamp: Timestamp,
    endTimestamp: Timestamp,
  ) => SubDomain[];
  extractUnit: (ts: Timestamp) => Timestamp;
};

export type SubDomain = {
  t: Timestamp;
  x: number;
  y: number;
  v?: number | string | null;
};

export type Dimensions = {
  width: number;
  height: number;
};

// Plugin

export interface IPlugin {
  calendar: CalHeatmap;
  options: PluginOptions;
  root: any;

  setup: (calendar: CalHeatmap, options?: PluginOptions) => void;
  paint: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
}

export interface PluginOptions {
  position?: 'top' | 'right' | 'bottom' | 'left';
  dimensions?: Dimensions;
  key?: string;
}

declare class CalHeatmap {
  static readonly VERSION = string;

  options: Options;

  eventEmitter: EventEmitter;

  dateHelper: DateHelper;

  calendarPainter: CalendarPainter;

  constructor();

  paint(
    options?: DeepPartial<OptionsType>,
    plugins?: IPlugin[],
  ): Promise<unknown>;

  addTemplates(templates: Template | Template[]): void;

  next(n?: number): Promise<unknown>;

  previous(n?: number): Promise<unknown>;

  jumpTo(date: Date, reset?: boolean): Promise<unknown>;

  fill(dataSource?: OptionsType['data']['source']): Promise<unknown>;

  on(name: string, fn: () => any): void;

  dimensions(): Dimensions;

  destroy(): Promise<unknown>;

  extendDayjs(plugin: PluginFunc): dayjs.Dayjs;
}

declare const constants: Record<string, any>;
declare const helpers: {
  position: {
    isHorizontal(position: string): boolean
    isVertical(position: string): boolean
    horizontalPadding(padding: Padding): number
    verticalPadding(padding: Padding): number
  },
  scale: {
    normalizedScale(scaleOptions: OptionsType['scale']): any
    applyScaleStyle(
      elem: any,
      _scale: any,
      scaleOptions: OptionsType['scale'],
      keyname?: string,
    ): void
  }
};

export default CalHeatmap;
export { constants, helpers };
```

## File: src/version.ts
```typescript
const VERSION = '4.3.0-beta.4';
export default VERSION;
```

## File: package.json
```json
{
  "name": "cal-heatmap",
  "version": "4.3.0-beta.4",
  "description": "Cal-Heatmap is a javascript module to create calendar heatmap to visualize time series data",
  "keywords": [
    "calendar",
    "graph",
    "d3js",
    "heat map"
  ],
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/cal-heatmap.esm.js",
      "require": "./dist/cal-heatmap.js",
      "types": "./src/types.d.ts"
    },
    "./package.json": "./package.json",
    "./cal-heatmap.css": "./dist/cal-heatmap.css"
  },
  "directories": {
    "test": "test"
  },
  "types": "./src/types.d.ts",
  "node": ">=14.16",
  "browserslist": "last 2 versions, not dead, > 0.2%",
  "dependencies": {
    "@observablehq/plot": "^0.6.0",
    "core-js": "^3.35.1",
    "d3-color": "^3.1.0",
    "d3-fetch": "^3.0.1",
    "d3-selection": "^3.0.0",
    "d3-transition": "^3.0.1",
    "dayjs": "^1.11.7",
    "eventemitter3": "^5.0.0",
    "lodash-es": "^4.17.21"
  },
  "devDependencies": {
    "@babel/preset-env": "^7.20.2",
    "@rollup/plugin-babel": "^6.0.3",
    "@rollup/plugin-commonjs": "^25.0.0",
    "@rollup/plugin-json": "^6.0.0",
    "@rollup/plugin-node-resolve": "^15.0.1",
    "@rollup/plugin-replace": "^5.0.1",
    "@rollup/plugin-terser": "^0.4.0",
    "@rollup/plugin-typescript": "^11.0.0",
    "@types/d3": "^7.4.3",
    "@types/jest": "^29.2.4",
    "@types/lodash-es": "^4.17.6",
    "@types/selenium-webdriver": "^4.1.10",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "autoprefixer": "^10.4.13",
    "browserslist": "^4.21.4",
    "browserstack-local": "^1.5.1",
    "cz-conventional-changelog": "^3.3.0",
    "eslint": "^8.29.0",
    "eslint-config-airbnb-base": "^15.0.0",
    "eslint-config-airbnb-typescript": "^17.0.0",
    "eslint-plugin-jest": "^27.1.5",
    "jest": "^29.3.1",
    "jest-dev-server": "^10.0.0",
    "jest-environment-jsdom": "^29.3.1",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.20",
    "prettier": "^3.0.0",
    "puppeteer": "^22.0.0",
    "rollup": "^4.0.0",
    "rollup-plugin-filesize": "^10.0.0",
    "rollup-plugin-postcss": "^4.0.2",
    "sass": "^1.56.1",
    "selenium-webdriver": "^4.7.1",
    "ts-jest": "^29.0.3",
    "tsd": "^0.30.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "prepare": "npm run build && npm test",
    "format": "npm run lint -- --fix",
    "lint": "npx eslint src/ test/",
    "build": "rm -rf dist/* && rollup -c",
    "dev": "rollup --config -w",
    "test": "node --experimental-vm-modules ./node_modules/.bin/jest test/",
    "test:e2e": "node --experimental-vm-modules ./node_modules/.bin/jest -c jest-e2e.config.mjs test/",
    "test:e2e:local": "LOCAL=1 node --experimental-vm-modules ./node_modules/.bin/jest -c jest-e2e.config.mjs test/",
    "tsd": "npx tsd --files test/index.test-d.ts",
    "typecheck": "npx tsc --noEmit"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/wa0x6e/cal-heatmap.git"
  },
  "homepage": "https://cal-heatmap.com",
  "author": {
    "name": "Wan Qi Chen",
    "url": "https://github.com/wa0x6e"
  },
  "license": "MIT",
  "bugs": "https://github.com/wa0x6e/cal-heatmap/issues",
  "categories": [
    "Data",
    "Visualization"
  ],
  "files": [
    "dist",
    "src/types.d.ts"
  ],
  "config": {
    "commitizen": {
      "path": "./node_modules/cz-conventional-changelog"
    }
  }
}
```

## File: README.md
```markdown
[![Cal-Heatmap logo](https://cal-heatmap.com/img/favicon.png)](https://cal-heatmap.com/img/favicon.png)

# Cal-HeatMap [![Coverage Status](https://coveralls.io/repos/wa0x6e/cal-heatmap/badge.svg?branch=master&service=github)](https://coveralls.io/github/wa0x6e/cal-heatmap?branch=master) [![npm version](https://badge.fury.io/js/cal-heatmap.svg)](https://badge.fury.io/js/cal-heatmap) [![node](https://github.com/wa0x6e/cal-heatmap/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/wa0x6e/cal-heatmap/actions/workflows/test.yml) [![node](https://github.com/wa0x6e/cal-heatmap/actions/workflows/lint.yml/badge.svg?branch=master)](https://github.com/wa0x6e/cal-heatmap/actions/workflows/lint.yml)

> Cal-Heatmap is a javascript charting library to create a time-series calendar heatmap

This library will help you to chart a calendar heatmap, like the _[Github contribution calendar](https://github.com/blog/1360-introducing-contributions)_ appearing on each github user's page, but with more features like:

- 🔀 animated date navigation
- ⏳ time interval customisation
- 🗓️ full controls on the layout/UI
- 🌐 locale and timezone support
- ⚡ plugins system
- 🖥️ broad browsers support
- 🔚 right-to-left support
- ♾️ and many more...

![Github like Calendar Heatmap example](https://cal-heatmap.com/examples/1.png)
![Year/Day linear scale with legend Calendar Heatmap example](https://cal-heatmap.com/examples/2.png)
![Year/Day threshold scale with legend Calendar Heatmap example](https://cal-heatmap.com/examples/3.png)
![Month/Day alternate layout Calendar Heatmap example](https://cal-heatmap.com/examples/4.png)
![Month/Day weekdays only Calendar Heatmap example](https://cal-heatmap.com/examples/5.png)

See [documentation website](http://cal-heatmap.com) for full documentation and more examples.

## License

Cal-Heatmap is licensed under a [MIT License](./LICENSE).
```
