/**
 * BAW Schema Discovery — Service Flow Script
 * ============================================================================
 * Place this script inside a BAW Service Flow "Server Script" component.
 *
 * Prerequisites
 * -------------
 * 1. A JDBC data source configured in BAW that connects to the BAW Db2
 *    database (e.g. the "BPMDB" data source).  Update DATA_SOURCE_NAME below.
 * 2. The BAW service account must have SELECT privilege on the SYSCAT views.
 *
 * Output
 * ------
 * The script populates four process variables on tw.local:
 *
 *   tw.local.tables      — list of all BAW tables/views with row counts
 *   tw.local.columns     — list of all columns with full data-type detail
 *   tw.local.primaryKeys — list of PK / unique constraints and their columns
 *   tw.local.foreignKeys — list of FK relationships (child ↔ parent)
 *
 * Each variable is an Array of plain JavaScript objects whose property names
 * match the column aliases defined in baw_schema_queries.sql.
 *
 * Error handling
 * --------------
 * Any SQL failure is caught; tw.local.error is set with the message and the
 * script exits cleanly so the Service Flow can route to an error lane.
 * ============================================================================
 */

/* ── Configuration ─────────────────────────────────────────────────────────── */

/** JNDI name of the Db2 data source configured in the BAW server.            */
var DATA_SOURCE_NAME = "jdbc/BAWDB";   // ← update to match your environment

/* ── SQL Definitions ────────────────────────────────────────────────────────── */

var SQL_TABLES = [
    "SELECT",
    "    T.TABSCHEMA  AS SCHEMA_NAME,",
    "    T.TABNAME    AS TABLE_NAME,",
    "    T.TYPE       AS TABLE_TYPE,",
    "    T.CARD       AS APPROX_ROW_COUNT,",
    "    T.REMARKS    AS REMARKS",
    "FROM",
    "    SYSCAT.TABLES T",
    "WHERE",
    "    T.TYPE IN ('T', 'V')",
    "    AND T.TABSCHEMA NOT IN (",
    "        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',",
    "        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'",
    "    )",
    "ORDER BY T.TABSCHEMA, T.TABNAME"
].join(" ");

var SQL_COLUMNS = [
    "SELECT",
    "    C.TABSCHEMA     AS SCHEMA_NAME,",
    "    C.TABNAME       AS TABLE_NAME,",
    "    C.COLNO         AS COLUMN_POSITION,",
    "    C.COLNAME       AS COLUMN_NAME,",
    "    C.TYPENAME      AS DATA_TYPE,",
    "    C.LENGTH        AS DATA_LENGTH,",
    "    C.SCALE         AS DATA_SCALE,",
    "    C.NULLS         AS NULLABLE,",
    "    C.DEFAULT       AS DEFAULT_VALUE,",
    "    C.IDENTITY      AS IS_IDENTITY,",
    "    C.GENERATED     AS IS_GENERATED,",
    "    C.REMARKS       AS REMARKS",
    "FROM",
    "    SYSCAT.COLUMNS C",
    "WHERE",
    "    C.TABSCHEMA NOT IN (",
    "        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',",
    "        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'",
    "    )",
    "ORDER BY C.TABSCHEMA, C.TABNAME, C.COLNO"
].join(" ");

var SQL_PRIMARY_KEYS = [
    "SELECT",
    "    TC.TABSCHEMA    AS SCHEMA_NAME,",
    "    TC.TABNAME      AS TABLE_NAME,",
    "    TC.CONSTNAME    AS CONSTRAINT_NAME,",
    "    TC.TYPE         AS CONSTRAINT_TYPE,",
    "    KC.COLNAME      AS COLUMN_NAME,",
    "    KC.COLSEQ       AS KEY_SEQUENCE",
    "FROM",
    "    SYSCAT.TABCONST TC",
    "    JOIN SYSCAT.KEYCOLUSE KC",
    "        ON  TC.TABSCHEMA = KC.TABSCHEMA",
    "        AND TC.TABNAME   = KC.TABNAME",
    "        AND TC.CONSTNAME = KC.CONSTNAME",
    "WHERE",
    "    TC.TYPE IN ('P', 'U')",
    "    AND TC.TABSCHEMA NOT IN (",
    "        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',",
    "        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'",
    "    )",
    "ORDER BY TC.TABSCHEMA, TC.TABNAME, TC.TYPE, KC.COLSEQ"
].join(" ");

var SQL_FOREIGN_KEYS = [
    "SELECT",
    "    R.TABSCHEMA     AS FK_SCHEMA,",
    "    R.TABNAME       AS FK_TABLE,",
    "    R.CONSTNAME     AS FK_CONSTRAINT_NAME,",
    "    R.REFTABSCHEMA  AS PK_SCHEMA,",
    "    R.REFTABNAME    AS PK_TABLE,",
    "    R.REFKEYNAME    AS PK_CONSTRAINT_NAME,",
    "    R.DELETERULE    AS ON_DELETE,",
    "    R.UPDATERULE    AS ON_UPDATE,",
    "    FK_COLS.COLNAME AS FK_COLUMN,",
    "    FK_COLS.COLSEQ  AS KEY_SEQUENCE,",
    "    PK_COLS.COLNAME AS PK_COLUMN",
    "FROM",
    "    SYSCAT.REFERENCES R",
    "    JOIN SYSCAT.KEYCOLUSE FK_COLS",
    "        ON  R.TABSCHEMA  = FK_COLS.TABSCHEMA",
    "        AND R.TABNAME    = FK_COLS.TABNAME",
    "        AND R.CONSTNAME  = FK_COLS.CONSTNAME",
    "    JOIN SYSCAT.KEYCOLUSE PK_COLS",
    "        ON  R.REFTABSCHEMA = PK_COLS.TABSCHEMA",
    "        AND R.REFTABNAME   = PK_COLS.TABNAME",
    "        AND R.REFKEYNAME   = PK_COLS.CONSTNAME",
    "        AND FK_COLS.COLSEQ = PK_COLS.COLSEQ",
    "WHERE",
    "    R.TABSCHEMA NOT IN (",
    "        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',",
    "        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'",
    "    )",
    "ORDER BY R.TABSCHEMA, R.TABNAME, R.CONSTNAME, FK_COLS.COLSEQ"
].join(" ");

/* ── Helper : run a SQL query and return an Array of row objects ─────────────── */

/**
 * Executes a SELECT statement via the BAW JDBC integration API and converts
 * the ResultSet into a plain JavaScript Array of objects.
 *
 * @param  {string} dataSourceName  JNDI name of the configured data source
 * @param  {string} sql             The SELECT statement to execute
 * @returns {Array}                 Array of row objects; empty array if no rows
 */
function executeQuery(dataSourceName, sql) {
    var rows = [];
    var connection = null;
    var statement  = null;
    var resultSet  = null;

    try {
        // Obtain a connection from the named data source
        connection = tw.system.getNamedDataSource(dataSourceName).getConnection();

        statement = connection.createStatement();
        resultSet = statement.executeQuery(sql);

        var metaData   = resultSet.getMetaData();
        var columnCount = metaData.getColumnCount();

        // Build column-name array once (JDBC column indices are 1-based)
        var columnNames = [];
        for (var c = 1; c <= columnCount; c++) {
            columnNames.push(metaData.getColumnLabel(c).toLowerCase());
        }

        // Iterate rows
        while (resultSet.next()) {
            var row = {};
            for (var i = 0; i < columnNames.length; i++) {
                var raw = resultSet.getObject(i + 1);
                // Unwrap Java null → JS null; preserve all other types as strings
                row[columnNames[i]] = (raw === null || raw === undefined)
                    ? null
                    : String(raw).trim();
            }
            rows.push(row);
        }

    } finally {
        // Always release resources in reverse acquisition order
        if (resultSet  !== null) { try { resultSet.close();  } catch (e) { /* ignore */ } }
        if (statement  !== null) { try { statement.close();  } catch (e) { /* ignore */ } }
        if (connection !== null) { try { connection.close(); } catch (e) { /* ignore */ } }
    }

    return rows;
}

/* ── Main execution block ────────────────────────────────────────────────────── */

// Initialise output variables
tw.local.tables      = [];
tw.local.columns     = [];
tw.local.primaryKeys = [];
tw.local.foreignKeys = [];
tw.local.error       = null;

try {

    log.info("BAW Schema Discovery: starting query execution against [" + DATA_SOURCE_NAME + "]");

    // 1. Tables
    log.info("BAW Schema Discovery: querying SYSCAT.TABLES ...");
    tw.local.tables = executeQuery(DATA_SOURCE_NAME, SQL_TABLES);
    log.info("BAW Schema Discovery: tables found = " + tw.local.tables.length);

    // 2. Columns
    log.info("BAW Schema Discovery: querying SYSCAT.COLUMNS ...");
    tw.local.columns = executeQuery(DATA_SOURCE_NAME, SQL_COLUMNS);
    log.info("BAW Schema Discovery: columns found = " + tw.local.columns.length);

    // 3. Primary / Unique keys
    log.info("BAW Schema Discovery: querying SYSCAT.TABCONST + SYSCAT.KEYCOLUSE (PKs/UKs) ...");
    tw.local.primaryKeys = executeQuery(DATA_SOURCE_NAME, SQL_PRIMARY_KEYS);
    log.info("BAW Schema Discovery: primary/unique key entries found = " + tw.local.primaryKeys.length);

    // 4. Foreign keys
    log.info("BAW Schema Discovery: querying SYSCAT.REFERENCES (FKs) ...");
    tw.local.foreignKeys = executeQuery(DATA_SOURCE_NAME, SQL_FOREIGN_KEYS);
    log.info("BAW Schema Discovery: foreign key entries found = " + tw.local.foreignKeys.length);

    log.info("BAW Schema Discovery: completed successfully.");

} catch (err) {
    var msg = "BAW Schema Discovery FAILED: " + (err.message || String(err));
    log.error(msg);
    tw.local.error = msg;
}
