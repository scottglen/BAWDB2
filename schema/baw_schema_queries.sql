-- =============================================================================
-- BAW DB2 Schema Discovery Queries
-- Purpose : Retrieve full metadata for all BAW internal database tables,
--           including columns (with data types), primary keys, and foreign-key
--           relationships.
-- Target  : IBM Db2 SYSCAT catalog views
-- Usage   : These queries are embedded in the JavaScript BAW Service Flow
--           wrapper (baw_schema_service_flow.js) and executed via JDBC.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- QUERY 1 : All BAW tables with row counts and remarks
--           Filters on the BAW schema names commonly used by IBM BAW/BPM:
--           LSW, BPMDB, PDWDB, CMNDB, BPM, BAWDB
-- -----------------------------------------------------------------------------
SELECT
    T.TABSCHEMA                 AS SCHEMA_NAME,
    T.TABNAME                   AS TABLE_NAME,
    T.TYPE                      AS TABLE_TYPE,       -- 'T' = table, 'V' = view
    T.CARD                      AS APPROX_ROW_COUNT,
    T.REMARKS                   AS REMARKS
FROM
    SYSCAT.TABLES T
WHERE
    T.TYPE IN ('T', 'V')
    AND T.TABSCHEMA NOT IN (
        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',
        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'
    )
ORDER BY
    T.TABSCHEMA,
    T.TABNAME;


-- -----------------------------------------------------------------------------
-- QUERY 2 : All columns for every BAW table, with full data-type detail
-- -----------------------------------------------------------------------------
SELECT
    C.TABSCHEMA                 AS SCHEMA_NAME,
    C.TABNAME                   AS TABLE_NAME,
    C.COLNO                     AS COLUMN_POSITION,
    C.COLNAME                   AS COLUMN_NAME,
    C.TYPENAME                  AS DATA_TYPE,
    C.LENGTH                    AS DATA_LENGTH,
    C.SCALE                     AS DATA_SCALE,
    C.NULLS                     AS NULLABLE,          -- 'Y' or 'N'
    C.DEFAULT                   AS DEFAULT_VALUE,
    C.IDENTITY                  AS IS_IDENTITY,       -- 'Y' if auto-generated
    C.GENERATED                 AS IS_GENERATED,      -- 'A' always, 'D' default, 'N' never
    C.REMARKS                   AS REMARKS
FROM
    SYSCAT.COLUMNS C
WHERE
    C.TABSCHEMA NOT IN (
        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',
        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'
    )
ORDER BY
    C.TABSCHEMA,
    C.TABNAME,
    C.COLNO;


-- -----------------------------------------------------------------------------
-- QUERY 3 : Primary keys (and unique constraints)
-- -----------------------------------------------------------------------------
SELECT
    TC.TABSCHEMA                AS SCHEMA_NAME,
    TC.TABNAME                  AS TABLE_NAME,
    TC.CONSTNAME                AS CONSTRAINT_NAME,
    TC.TYPE                     AS CONSTRAINT_TYPE,   -- 'P' = primary key, 'U' = unique
    KC.COLNAME                  AS COLUMN_NAME,
    KC.COLSEQ                   AS KEY_SEQUENCE
FROM
    SYSCAT.TABCONST TC
    JOIN SYSCAT.KEYCOLUSE KC
        ON  TC.TABSCHEMA = KC.TABSCHEMA
        AND TC.TABNAME   = KC.TABNAME
        AND TC.CONSTNAME = KC.CONSTNAME
WHERE
    TC.TYPE IN ('P', 'U')
    AND TC.TABSCHEMA NOT IN (
        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',
        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'
    )
ORDER BY
    TC.TABSCHEMA,
    TC.TABNAME,
    TC.TYPE,
    KC.COLSEQ;


-- -----------------------------------------------------------------------------
-- QUERY 4 : Foreign-key relationships
--           Shows parent table → child table linkage with matched column names
-- -----------------------------------------------------------------------------
SELECT
    R.TABSCHEMA                 AS FK_SCHEMA,
    R.TABNAME                   AS FK_TABLE,
    R.CONSTNAME                 AS FK_CONSTRAINT_NAME,
    R.REFTABSCHEMA              AS PK_SCHEMA,
    R.REFTABNAME                AS PK_TABLE,
    R.REFKEYNAME                AS PK_CONSTRAINT_NAME,
    R.DELETERULE                AS ON_DELETE,         -- 'A'=no action,'C'=cascade,'N'=set null,'R'=restrict
    R.UPDATERULE                AS ON_UPDATE,
    FK_COLS.COLNAME             AS FK_COLUMN,
    FK_COLS.COLSEQ              AS KEY_SEQUENCE,
    PK_COLS.COLNAME             AS PK_COLUMN
FROM
    SYSCAT.REFERENCES R
    JOIN SYSCAT.KEYCOLUSE FK_COLS
        ON  R.TABSCHEMA  = FK_COLS.TABSCHEMA
        AND R.TABNAME    = FK_COLS.TABNAME
        AND R.CONSTNAME  = FK_COLS.CONSTNAME
    JOIN SYSCAT.KEYCOLUSE PK_COLS
        ON  R.REFTABSCHEMA = PK_COLS.TABSCHEMA
        AND R.REFTABNAME   = PK_COLS.TABNAME
        AND R.REFKEYNAME   = PK_COLS.CONSTNAME
        AND FK_COLS.COLSEQ = PK_COLS.COLSEQ
WHERE
    R.TABSCHEMA NOT IN (
        'SYSCAT','SYSIBM','SYSSTAT','SYSTOOLS','SYSPROC',
        'SYSIBMADM','SYSFUN','SYSIBMINTERNAL'
    )
ORDER BY
    R.TABSCHEMA,
    R.TABNAME,
    R.CONSTNAME,
    FK_COLS.COLSEQ;
