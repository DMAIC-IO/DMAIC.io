/**
 * SheetJS (XLSX) bundled from node_modules. Single import site so the whole
 * app shares one bundled copy; removes the former global <script> tag and the
 * trusted-types dynamic-load workaround.
 */
import * as XLSX from 'xlsx';
export { XLSX };
