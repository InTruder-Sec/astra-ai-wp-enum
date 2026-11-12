#!/bin/sh
# Provisions the vulnerable WordPress lab. Idempotent: safe to re-run.
# Runs inside the wordpress:cli container with the site volume mounted.
set -eu

SITE_URL="http://localhost:8090"
cd /var/www/html

echo "[seed] waiting for wp-config.php ..."
until [ -f wp-config.php ]; do sleep 2; done

echo "[seed] waiting for database ..."
# Probe DB readiness via PHP mysqli (the mysql client binary is absent from the
# cli image, and WP itself connects through PHP anyway).
until php -r 'exit(@mysqli_connect("db","wordpress","wordpress","wordpress") ? 0 : 1);' 2>/dev/null; do
  sleep 3
done

if wp core is-installed >/dev/null 2>&1; then
  echo "[seed] WordPress already installed - skipping."
  wp user list --fields=ID,user_login,roles --format=csv
  exit 0
fi

echo "[seed] installing WordPress (weak admin password on purpose) ..."
wp core install \
  --url="$SITE_URL" \
  --title="Vulnerable WP Lab" \
  --admin_user="admin" \
  --admin_password="admin123" \
  --admin_email="admin@lab.local" \
  --skip-email

echo "[seed] enabling pretty permalinks (enables ?author=N -> /author/<slug>) ..."
wp rewrite structure '/%postname%/' --hard
wp option update blog_public 1 >/dev/null

# Create a user only if it does not already exist (keeps re-runs clean).
create_user() {
  login="$1"; email="$2"; role="$3"; pass="$4"
  if ! wp user get "$login" >/dev/null 2>&1; then
    wp user create "$login" "$email" --role="$role" --user_pass="$pass" >/dev/null
    echo "[seed]   + user $login ($role)"
  fi
}

create_user editor editor@lab.local editor editor123
create_user jsmith jsmith@lab.local author author123
create_user awong  awong@lab.local  author wong12345

# Publish one post per user so each appears in REST users, author archives,
# the user sitemap, oEmbed and feeds. Without a published post a user is not
# exposed by those vectors.
publish_for() {
  login="$1"; title="$2"
  uid=$(wp user get "$login" --field=ID)
  wp post create \
    --post_type=post --post_status=publish --post_author="$uid" \
    --post_title="$title" \
    --post_content="Sample post authored by $login for enumeration testing." >/dev/null
  echo "[seed]   + post for $login (uid=$uid)"
}

publish_for admin  "Welcome to the Lab"
publish_for editor "Editorial Notes"
publish_for jsmith "Field Report One"
publish_for awong  "Research Update"

echo "[seed] done. Seeded users:"
wp user list --fields=ID,user_login,roles --format=csv
