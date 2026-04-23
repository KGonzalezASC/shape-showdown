import React from 'react';
import { CELL_SIZE } from '../types';

/** When set by GameFieldsLayout, GameField picks this up unless `cellSize` is passed explicitly. */
export const PlayfieldCellSizeContext = React.createContext<number>(CELL_SIZE);
