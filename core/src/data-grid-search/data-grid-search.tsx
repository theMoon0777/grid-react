// import AppIcon from "common/app-icon";
import * as React from "react";
import { GridCell, GridCellKind, GridSelection, Rectangle } from "../data-grid/data-grid-types";
import ScrollingDataGrid, { ScrollingDataGridProps } from "../scrolling-data-grid/scrolling-data-grid";
import { SearchWrapper } from "./data-grid-search-style";
import { assert } from "../common/support";
import { InnerGridCell } from "..";

// icons
const UpArrow = () => (
    <svg className="button-icon" viewBox="0 0 512 512">
        <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="48"
            d="M112 244l144-144 144 144M256 120v292"
        />
    </svg>
);
const DownArrow = () => (
    <svg className="button-icon" viewBox="0 0 512 512">
        <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="48"
            d="M112 268l144 144 144-144M256 392V100"
        />
    </svg>
);

const CloseX = () => (
    <svg className="button-icon" viewBox="0 0 512 512">
        <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="32"
            d="M368 368L144 144M368 144L144 368"
        />
    </svg>
);

export interface DataGridSearchProps extends Omit<ScrollingDataGridProps, "prelightCells"> {
    readonly getCellsForSelection?: (selection: Rectangle) => readonly (readonly GridCell[])[];
    readonly onSearchResultsChanged?: (results: readonly (readonly [number, number])[], navIndex: number) => void;
    readonly searchColOffset: number;
    readonly showSearch?: boolean;
    readonly onSearchClose?: () => void;
}

const targetSearchTimeMS = 10;

const DataGridSearch: React.FunctionComponent<DataGridSearchProps> = p => {
    const {
        onKeyDown,
        getCellsForSelection,
        onSearchResultsChanged,
        searchColOffset,
        showSearch = false,
        onSearchClose,
        ...rest
    } = p;
    const { canvasRef, cellYOffset, rows, columns, getCellContent } = p;

    const [searchString, setSearchString] = React.useState("");
    const [searchStatus, setSearchStatus] = React.useState<{
        rowsSearched: number;
        results: number;
        selectedIndex: number;
    }>();

    const searchStatusRef = React.useRef(searchStatus);
    searchStatusRef.current = searchStatus;

    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const searchHandle = React.useRef<number>();
    const [searchResults, setSearchResults] = React.useState<readonly (readonly [number, number])[]>([]);

    const cancelSearch = React.useCallback(() => {
        if (searchHandle.current !== undefined) {
            window.cancelAnimationFrame(searchHandle.current);
            searchHandle.current = undefined;
        }
    }, []);

    const getCellsForSelectionMangled = React.useCallback(
        (selection: GridSelection): readonly (readonly InnerGridCell[])[] => {
            if (getCellsForSelection !== undefined) return getCellsForSelection(selection.range);

            if (selection.range === undefined) {
                return [[getCellContent(selection.cell)]];
            }

            const range = selection.range;

            const result: InnerGridCell[][] = [];
            for (let row = range.y; row < range.y + range.height; row++) {
                const inner: InnerGridCell[] = [];
                for (let col = range.x; col < range.x + range.width; col++) {
                    inner.push(getCellContent([col + searchColOffset, row]));
                }

                result.push(inner);
            }

            return result;
        },
        [getCellContent, getCellsForSelection, searchColOffset]
    );

    const beginSearch = React.useCallback(
        (str: string) => {
            const regex = new RegExp(str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), "i");

            let startY = cellYOffset;

            // Lets assume we can do 10 rows at a time
            // This is usually very safe and limits the damage for bad
            // performing sheets.
            let searchStride = Math.min(10, rows);

            let rowsSearched = 0;

            setSearchStatus(undefined);
            setSearchResults([]);

            const runningResult: [number, number][] = [];

            const tick = () => {
                const tStart = performance.now();
                const rowsLeft = rows - rowsSearched;
                const data = getCellsForSelectionMangled({
                    cell: [0, 0],
                    range: {
                        x: 0,
                        y: startY,
                        width: columns.length - searchColOffset,
                        height: Math.min(searchStride, rowsLeft, rows - startY),
                    },
                });

                let added = false;
                data.forEach((d, row) =>
                    d.forEach((cell, col) => {
                        let testString: string | undefined;
                        switch (cell.kind) {
                            case GridCellKind.Text:
                            case GridCellKind.Number:
                                testString = cell.displayData;
                                break;
                            case GridCellKind.Uri:
                            case GridCellKind.Markdown:
                                testString = cell.data;
                                break;
                            case GridCellKind.Boolean:
                                testString = cell.data.toString();
                                break;
                            case GridCellKind.Image:
                            case GridCellKind.Bubble:
                                // I know its lazy, but unless someone is actually
                                // searching for the whale emoji, this is pretty side effect
                                // free. And ya know... it's nice and easy to do...
                                testString = cell.data.join("🐳");
                                break;
                        }

                        if (testString !== undefined && regex.test(testString)) {
                            runningResult.push([col + searchColOffset, row + startY]);
                            added = true;
                        }
                    })
                );
                const tEnd = performance.now();

                if (added) {
                    setSearchResults([...runningResult]);
                }

                rowsSearched += data.length;
                assert(rowsSearched <= rows);

                const selectedIndex = searchStatusRef.current?.selectedIndex ?? -1;
                setSearchStatus({
                    results: runningResult.length,
                    rowsSearched,
                    selectedIndex,
                });
                onSearchResultsChanged?.(runningResult, selectedIndex);

                if (startY + searchStride >= rows) {
                    startY = 0;
                } else {
                    startY += searchStride;
                }

                const tElapsed = tEnd - tStart;
                const rounded = Math.max(tElapsed, 1);

                const scalar = targetSearchTimeMS / rounded;
                searchStride = Math.ceil(searchStride * scalar);

                if (rowsSearched < rows && runningResult.length < 1000) {
                    searchHandle.current = window.requestAnimationFrame(tick);
                }
            };

            cancelSearch();
            searchHandle.current = window.requestAnimationFrame(tick);
        },
        [
            cancelSearch,
            cellYOffset,
            columns.length,
            getCellsForSelectionMangled,
            onSearchResultsChanged,
            rows,
            searchColOffset,
        ]
    );

    const cancelEvent = React.useCallback((ev: React.MouseEvent) => {
        ev.stopPropagation();
    }, []);

    const onClose = React.useCallback(() => {
        onSearchClose?.();
        setSearchStatus(undefined);
        setSearchResults([]);
        onSearchResultsChanged?.([], -1);
        cancelSearch();
        canvasRef?.current?.focus();
    }, [cancelSearch, canvasRef, onSearchClose, onSearchResultsChanged]);

    const onSearchChange = React.useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setSearchString(event.target.value);
            if (event.target.value === "") {
                setSearchStatus(undefined);
                setSearchResults([]);
                cancelSearch();
            } else {
                beginSearch(event.target.value);
            }
        },
        [beginSearch, cancelSearch]
    );

    React.useEffect(() => {
        if (showSearch && inputRef.current !== null) {
            setSearchString("");
            inputRef.current.focus({ preventScroll: true });
        }
    }, [showSearch]);

    const onNext = React.useCallback(
        (ev?: React.MouseEvent) => {
            ev?.stopPropagation?.();
            if (searchStatus === undefined) return;
            const newIndex = (searchStatus.selectedIndex + 1) % searchStatus.results;
            setSearchStatus({
                ...searchStatus,
                selectedIndex: newIndex,
            });
            onSearchResultsChanged?.(searchResults, newIndex);
        },
        [searchStatus, onSearchResultsChanged, searchResults]
    );

    const onPrev = React.useCallback(
        (ev?: React.MouseEvent) => {
            ev?.stopPropagation?.();
            if (searchStatus === undefined) return;
            let newIndex = (searchStatus.selectedIndex - 1) % searchStatus.results;
            if (newIndex < 0) newIndex += searchStatus.results;
            setSearchStatus({
                ...searchStatus,
                selectedIndex: newIndex,
            });
            onSearchResultsChanged?.(searchResults, newIndex);
        },
        [onSearchResultsChanged, searchResults, searchStatus]
    );

    const onSearchKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (((event.ctrlKey || event.metaKey) && event.key === "f") || event.key === "Escape") {
                onClose();
                event.stopPropagation();
                event.preventDefault();
            } else if (event.key === "Enter") {
                if (event.shiftKey) {
                    onPrev();
                } else {
                    onNext();
                }
            }
        },
        [onClose, onNext, onPrev]
    );

    const rowsSearchedProgress = Math.floor(((searchStatus?.rowsSearched ?? 0) / rows) * 100);
    const progressStyle: React.CSSProperties = React.useMemo(() => {
        return {
            width: `${rowsSearchedProgress}%`,
        };
    }, [rowsSearchedProgress]);

    // cancel search if the component is unmounted
    React.useEffect(() => {
        return () => {
            cancelSearch();
        };
    }, [cancelSearch]);

    let resultString: string | undefined;
    if (searchStatus !== undefined) {
        if (searchStatus.results >= 1000) {
            resultString = `over 1000`;
        } else {
            resultString = `${searchStatus.results} result${searchStatus.results !== 1 ? "s" : ""}`;
        }
        if (searchStatus.selectedIndex >= 0) {
            resultString = `${searchStatus.selectedIndex + 1} of ${resultString}`;
        }
    }

    return (
        <>
            <ScrollingDataGrid {...rest} onKeyDown={onKeyDown} prelightCells={searchResults} />
            <SearchWrapper
                showSearch={showSearch}
                onMouseDown={cancelEvent}
                onMouseMove={cancelEvent}
                onMouseUp={cancelEvent}
                onClick={cancelEvent}>
                <div className="search-bar-inner">
                    <input
                        ref={inputRef}
                        onChange={onSearchChange}
                        value={searchString}
                        tabIndex={showSearch ? undefined : -1}
                        onKeyDownCapture={onSearchKeyDown}
                    />
                    <button
                        tabIndex={showSearch ? undefined : -1}
                        onClick={onPrev}
                        disabled={(searchStatus?.results ?? 0) === 0}>
                        <UpArrow />
                    </button>
                    <button
                        tabIndex={showSearch ? undefined : -1}
                        onClick={onNext}
                        disabled={(searchStatus?.results ?? 0) === 0}>
                        <DownArrow />
                    </button>
                    {onSearchClose !== undefined && (
                        <button tabIndex={showSearch ? undefined : -1} onClick={onClose}>
                            <CloseX />
                        </button>
                    )}
                </div>
                {searchStatus !== undefined && (
                    <>
                        <div className="search-status">
                            <div>{resultString}</div>
                        </div>
                        <div className="search-progress" style={progressStyle} />
                    </>
                )}
            </SearchWrapper>
        </>
    );
};

export default DataGridSearch;
